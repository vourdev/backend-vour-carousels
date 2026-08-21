import { Hono } from "hono";
import { defaultModel, resolveModel } from "../../lib/ai/registry";
import { generateBrief, generateSlidePlan, stripUnfulfillableEvidence } from "../../lib/ai/generate";
import { assembleCarousel } from "../../lib/ds/assemble";
import { warmUpIllustrations } from "../../lib/ds/illustrations.server";
import { captureQueue } from "../../services/capture-queue";
import { uploadImage } from "../../lib/publish/cloudinary";
import { scheduleBufferPost } from "../../lib/publish/buffer";
import { buildPostText } from "../../lib/publish/caption";
import { nextWibSlot, POST_HOUR_WIB } from "../../lib/publish/schedule";
import { createCarousel, updateCarousel, getUnderusedMockupTypes } from "../../lib/history/repo";
import { getTopic, getTopics, updateTopic, createTopic, type TopicStatus } from "../../lib/topics/bank";
import { generateAndSaveTopics, type GenerateTopicsInput } from "../../lib/topics/service";
import { extractAndSaveTopicsFromNotes } from "../../lib/research/agent";
import { dialect } from "../../lib/db";
import { Kysely } from "kysely";

const app = new Hono();

// We need Kysely to fetch the first user ID
const db = new Kysely<any>({ dialect });

interface GenerateRequest {
  topic?: string;
  title?: string;
  /**
   * The bank row this run came from, so it can be closed out on success.
   * Optional: /generate is also callable with a bare topic string that has no
   * bank entry behind it, and that must keep working.
   */
  topicId?: string;
}

async function resolveUserId(): Promise<string | null> {
  const user = await db.selectFrom("user").select("id").limit(1).executeTakeFirst();
  return (user?.id as string | undefined) ?? null;
}


async function createAndPublishCarousel({
  topic,
  angleInstruction,
  dueAt,
  userId,
  modelId,
  resolvedModel,
  channels,
}: {
  topic: string;
  angleInstruction: string;
  dueAt: string;
  userId: string;
  modelId: string;
  resolvedModel: any;
  channels: { igChannelId?: string; ttChannelId?: string };
}) {
  const ideaWithAngle = `${topic}${angleInstruction}`;

  // 1. Generate Brief Outline
  const brief = await generateBrief(ideaWithAngle, resolvedModel);

  // 2. Generate Slide Plan
  const underused = await getUnderusedMockupTypes(userId).catch(() => []);
  // Nobody is watching this run, so a mockup that asks a human for a screenshot can
  // never be satisfied — it would ship to Instagram as a placeholder card.
  const plan = stripUnfulfillableEvidence(await generateSlidePlan(brief, resolvedModel, underused));

  // 3. Assemble Carousel HTML
  await warmUpIllustrations();
  const html = assembleCarousel(plan);

  // 4. Capture Carousel slides using Playwright via concurrency queue
  const imageBase64s = await captureQueue.capture(async (browser) => {
    const pixelRatio = 2;
    const quality = 92;
    const SLIDE_W = 1080;
    const SLIDE_H = 1350;
    const READY_TIMEOUT_MS = 6000;

    const context = await browser.newContext({
      viewport: { width: SLIDE_W, height: SLIDE_H },
      deviceScaleFactor: pixelRatio,
    });

    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });

      try {
        await Promise.race([
          page.evaluate(() => document.fonts.ready),
          new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
        ]);
      } catch (e) {
        console.warn("Waiting for fonts timed out or failed:", e);
      }

      await page.waitForTimeout(500);

      const sections = await page.$$("section");
      if (sections.length === 0) {
        throw new Error("No slide <section> elements found to export");
      }

      const base64s: string[] = [];
      for (const section of sections) {
        const buffer = await section.screenshot({
          type: "jpeg",
          quality,
        });
        base64s.push(buffer.toString("base64"));
      }
      return base64s;
    } finally {
      await context.close();
    }
  });

  // 5. Upload screenshots to Cloudinary
  const imageUrls: string[] = [];
  for (const base64 of imageBase64s) {
    const secureUrl = await uploadImage(base64);
    imageUrls.push(secureUrl);
  }

  // 6. Save initial Carousel draft to Database
  const dbItem = await createCarousel({
    userId,
    source: "ai",
    title: plan.title,
    caption: plan.caption,
    hashtags: plan.hashtags,
    slideCount: plan.slides.length,
    model: modelId,
    status: "scheduled",
    thumbnail: imageUrls[0] || null,
    imageUrls,
    slidePlan: plan,
  });

  // 7. Publish to Buffer channels
  const text = buildPostText(plan.caption, plan.hashtags);

  let igPostId: string | undefined;
  let ttPostId: string | undefined;

  if (channels.igChannelId) {
    igPostId = await scheduleBufferPost({
      channelId: channels.igChannelId,
      text,
      assets: imageUrls,
      dueAt,
    });
  }

  if (channels.ttChannelId) {
    ttPostId = await scheduleBufferPost({
      channelId: channels.ttChannelId,
      text,
      assets: imageUrls,
      dueAt,
      isTikTok: true,
      title: plan.title,
    });
  }

  // 8. Update database record with Buffer post IDs
  await updateCarousel(dbItem.id, {
    status: "scheduled",
    bufferIgId: igPostId || null,
    bufferTtId: ttPostId || null,
    dueAt,
  });

  return {
    id: dbItem.id,
    title: plan.title,
    dueAt,
    imageCount: imageUrls.length,
    igPostId,
    ttPostId,
  };
}

app.post("/generate", async (c) => {
  let body: GenerateRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const topic = body.topic || body.title;
  if (!topic || !topic.trim()) {
    return c.json({ error: "Missing topic or title in request body" }, 400);
  }

  // 3. Resolve user ID from Turso
  let userId: string | null = null;
  try {
    const user = await db.selectFrom("user").select("id").limit(1).executeTakeFirst();
    userId = user?.id as string | null;
  } catch (err: any) {
    return c.json({ error: `Database user lookup failed: ${err.message}` }, 500);
  }

  if (!userId) {
    return c.json({ error: "No user found in the database. Seed the database first." }, 500);
  }

  // 4. Resolve default configured AI model
  const modelId = defaultModel();
  if (!modelId) {
    return c.json({ error: "No AI model API keys configured in .env" }, 500);
  }
  const resolvedModel = resolveModel(modelId);

  // 5. Setup publishing channels
  const igChannelId = process.env.BUFFER_IG_CHANNEL_ID;
  const ttChannelId = process.env.BUFFER_TIKTOK_CHANNEL_ID;
  if (!igChannelId && !ttChannelId) {
    return c.json({ error: "No active Buffer channels configured in .env" }, 500);
  }
  const channels = { igChannelId, ttChannelId };

  // 6. Calculate schedule times
  const due1 = nextWibSlot(new Date(), POST_HOUR_WIB);
  const due2 = new Date(due1.getTime() + 30 * 60 * 1000); // +30 minutes stagger

  const dueAt1 = due1.toISOString();
  const dueAt2 = due2.toISOString();

  // 7. Generate and Publish 2 Carousels
  //
  // allSettled, not all: the two decks are scheduled to Buffer independently, so one can
  // already be live when the other throws. Promise.all discards the winner's value in
  // that case and the whole request 500s — while the post it just scheduled stays
  // scheduled. n8n reads the 500, retries, and the topic goes out three times.
  const settled = await Promise.allSettled([
    createAndPublishCarousel({
      topic,
      angleInstruction: " (fokus: Panduan Praktis, Tips & Tutorial)",
      dueAt: dueAt1,
      userId,
      modelId,
      resolvedModel,
      channels,
    }),
    createAndPublishCarousel({
      topic,
      angleInstruction: " (fokus: Kesalahan Umum, Mitos, Studi Kasus & Konsep Mendalam)",
      dueAt: dueAt2,
      userId,
      modelId,
      resolvedModel,
      channels,
    }),
  ]);

  const scheduled = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failures = settled.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
  for (const err of failures) console.error("Carousel generation failed:", err);

  // Close the loop on the bank row. /topic/next moves a topic to "queued" so a retrigger
  // cannot hand out the same one twice, but for a long time nothing moved it on from
  // there — every topic the cron consumed stayed queued forever.
  //
  // Which way it moves depends on whether anything actually reached Buffer, and the two
  // directions protect against opposite failures:
  //  - something shipped -> "published". Retrying would post the same topic twice, and a
  //    partial run is not worth a duplicate.
  //  - nothing shipped   -> back to "idea", the only status /topic/next hands out. Left
  //    at "queued" the row is invisible to every query and the bank silently drains by
  //    one topic per failed run — which is what an outage upstream would do every night.
  if (body.topicId) {
    const closingStatus = scheduled.length > 0 ? ("published" as const) : ("idea" as const);
    await updateTopic(body.topicId, userId, {
      status: closingStatus,
      ...(scheduled.length > 0 ? { carouselId: scheduled[0].id } : {}),
    }).catch((err) => {
      // Never fail the request on this: when posts are already scheduled, reporting a
      // failure here is what invites the duplicate retry.
      console.error(`Failed to move topic ${body.topicId} to "${closingStatus}":`, err);
    });
  }

  if (scheduled.length === 0) {
    const reason = failures[0] instanceof Error ? failures[0].message : String(failures[0]);
    return c.json({ error: `Automation failed: ${reason}` }, 500);
  }

  return c.json({
    success: true,
    partial: scheduled.length < settled.length,
    message: `Scheduled ${scheduled.length} of ${settled.length} carousels to Buffer`,
    carousels: scheduled,
  });
});

// Hands the caller the next unstarted topic from the bank (status "idea"),
// then flips it to "queued" so a retriggered cron doesn't hand out the same
// topic twice before /generate has actually produced anything from it.
app.get("/topic/next", async (c) => {
  const userId = await resolveUserId().catch(() => null);
  if (!userId) {
    return c.json({ error: "No user found in the database. Seed the database first." }, 500);
  }

  // "approved" first, then "idea".
  //
  // Both are pullable, and "approved" outranks "idea" because a human has already looked
  // at it: research-agent candidates land as "pending_review" and only reach "approved" by
  // an explicit decision. Before this, /topic/next queried "idea" alone, so approving a
  // candidate moved it into a status nothing ever read — the approval endpoint worked and
  // the topic then disappeared from the pipeline for good.
  let [topic] = await getTopics(userId, { status: "approved", limit: 1 });
  if (!topic) [topic] = await getTopics(userId, { status: "idea", limit: 1 });
  if (!topic) {
    return c.json({ error: "No approved or idea topics available in the bank" }, 404);
  }

  await updateTopic(topic.id, userId, { status: "queued" });

  return c.json({
    id: topic.id,
    title: topic.title,
    category: topic.category,
    description: topic.description,
    angle: topic.angle,
  });
});

/**
 * Refill the topics bank on a schedule. Same batch logic the UI uses, reached
 * with an API key instead of a session — `userId` is optional so an n8n workflow
 * does not have to hardcode one for a single-tenant install.
 */
app.post("/topics/generate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as GenerateTopicsInput & { userId?: string };

  if (!["ideas", "weekly", "monthly"].includes(body?.mode)) {
    return c.json({ error: `Invalid mode "${body?.mode}" — use ideas | weekly | monthly` }, 400);
  }

  const uid = body.userId ?? (await resolveUserId().catch(() => null));
  if (!uid) {
    return c.json({ error: "No user found in the database. Seed the database first." }, 500);
  }

  const modelId = defaultModel();
  if (!modelId) {
    return c.json({ error: "No AI model API keys configured in .env" }, 500);
  }

  const topics = await generateAndSaveTopics(uid, resolveModel(modelId), body);
  return c.json({ success: true, topics, count: topics.length });
});

/* ── TASK 3+5: Research Agent — extract topics from raw notes ────────── */

app.post("/research-topics", async (c) => {
  let body: { rawNotes?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const rawNotes = body?.rawNotes;
  if (!rawNotes || !rawNotes.trim()) {
    return c.json({ error: "Missing or empty rawNotes in request body" }, 400);
  }

  const userId = await resolveUserId().catch(() => null);
  if (!userId) {
    return c.json({ error: "No user found in the database. Seed the database first." }, 500);
  }

  const modelId = defaultModel();
  if (!modelId) {
    return c.json({ error: "No AI model API keys configured in .env" }, 500);
  }

  try {
    const { saved, skipped } = await extractAndSaveTopicsFromNotes(
      userId,
      resolveModel(modelId),
      rawNotes,
      { status: "pending_review", source: "research-agent-mvp" }
    );

    return c.json({
      success: true,
      message: `Extracted ${saved.length} topic candidates, saved as pending_review${skipped.length ? `; skipped ${skipped.length} duplicate(s)` : ""}`,
      topics: saved,
      saved,
      skipped,
    });
  } catch (err: any) {
    console.error("Research agent failed:", err);
    return c.json({ error: `Research agent failed: ${err.message}` }, 500);
  }
});

/* ── TASK 6: Approval endpoint ───────────────────────────────────────── */

/**
 * Which status a topic may move to, from the one it currently holds.
 *
 * This table existed before but was never consulted — every value in a flat allow-list was
 * accepted from any state, so a "rejected" candidate could jump straight into the posting
 * queue. Transitions are checked against it now.
 *
 * "not_posted" is deliberately absent. It was accepted here and written through an `as any`,
 * but it is not a member of TopicStatus, so the row it produced matched no query anywhere
 * and the topic was simply lost. The status that means "reviewed, ready to post" is
 * "approved", and /topic/next reads it.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, TopicStatus[]> = {
  pending_review: ["approved", "rejected"],
  approved: ["pending_review", "rejected"],
  rejected: ["pending_review"],
  idea: ["approved", "rejected", "archived"],
};

app.patch("/research-topics/:id/status", async (c) => {
  let body: { status?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const newStatus = body?.status;
  if (!newStatus) {
    return c.json({ error: "Missing status in request body" }, 400);
  }

  const userId = await resolveUserId().catch(() => null);
  if (!userId) {
    return c.json({ error: "No user found in the database" }, 500);
  }

  const topicId = c.req.param("id");

  // Read the row first: the transition is only meaningful against the status it holds now,
  // and this is also what turns a mistyped id into a 404 instead of a cheerful success —
  // updateTopic matches on (id, user_id) and reports nothing when it matches no row.
  const topic = await getTopic(topicId, userId).catch(() => null);
  if (!topic) {
    return c.json({ error: `Topic "${topicId}" not found` }, 404);
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[topic.status] ?? [];
  if (!allowed.includes(newStatus as TopicStatus)) {
    return c.json(
      {
        error: `Cannot move a "${topic.status}" topic to "${newStatus}".`,
        from: topic.status,
        allowed,
      },
      409
    );
  }

  try {
    await updateTopic(topicId, userId, { status: newStatus as TopicStatus });
    return c.json({ success: true, topicId, from: topic.status, status: newStatus });
  } catch (err: any) {
    console.error(`Failed to update topic ${topicId}:`, err);
    return c.json({ error: `Failed to update topic: ${err.message}` }, 500);
  }
});

export default app;
