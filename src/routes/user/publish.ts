import { Hono } from "hono";
import { uploadImage } from "../../lib/publish/cloudinary";
import { scheduleBufferPost } from "../../lib/publish/buffer";
import { buildPostText } from "../../lib/publish/caption";
import { getCarousel, updateCarousel } from "../../lib/history/repo";
import type { SlidePlan } from "../../lib/ds/schema";

const app = new Hono<{ Variables: { session: any } }>();

/** Fan one set of assets out to whichever Buffer channels are configured. */
async function scheduleToChannels(params: {
  text: string;
  title: string;
  assets: string[];
  dueAt: string;
}): Promise<{ igPostId?: string; ttPostId?: string }> {
  const igChannelId = process.env.BUFFER_IG_CHANNEL_ID;
  const ttChannelId = process.env.BUFFER_TIKTOK_CHANNEL_ID;

  const results: { igPostId?: string; ttPostId?: string } = {};

  if (igChannelId) {
    results.igPostId = await scheduleBufferPost({
      channelId: igChannelId,
      text: params.text,
      assets: params.assets,
      dueAt: params.dueAt,
    });
  }

  if (ttChannelId) {
    results.ttPostId = await scheduleBufferPost({
      channelId: ttChannelId,
      text: params.text,
      assets: params.assets,
      dueAt: params.dueAt,
      isTikTok: true,
      title: params.title,
    });
  }

  return results;
}

function hasChannels(): boolean {
  return Boolean(process.env.BUFFER_IG_CHANNEL_ID || process.env.BUFFER_TIKTOK_CHANNEL_ID);
}

app.post("/upload", async (c) => {
  const { image } = await c.req.json() as { image: string };
  if (!image) {
    return c.json({ error: "Missing image base64" }, 400);
  }
  const secureUrl = await uploadImage(image);
  return c.json({ url: secureUrl });
});

app.post("/schedule", async (c) => {
  const { urls, plan, dueAt } = await c.req.json() as {
    urls: string[];
    plan: SlidePlan;
    dueAt: string;
  };

  if (!urls || !plan || !dueAt) {
    return c.json({ error: "Missing urls, plan or dueAt" }, 400);
  }

  if (!hasChannels()) {
    return c.json(
      { error: "Neither BUFFER_IG_CHANNEL_ID nor BUFFER_TIKTOK_CHANNEL_ID is configured in the environment" },
      500
    );
  }

  const results = await scheduleToChannels({
    text: buildPostText(plan.caption, plan.hashtags),
    title: plan.title,
    assets: urls,
    dueAt,
  });

  return c.json(results);
});

/**
 * Schedule a carousel that is already saved and exported, straight from its id.
 * The caller sends no caption or assets — those come from the stored row, so a
 * calendar publish cannot post different copy than what the deck was saved with.
 */
app.post("/carousel", async (c) => {
  const session = c.get("session") as { user: { id: string } };
  const { carouselId, dueAt } = (await c.req.json()) as { carouselId: string; dueAt: string };

  if (!carouselId || !dueAt) {
    return c.json({ error: "Missing carouselId or dueAt" }, 400);
  }

  const carousel = await getCarousel(carouselId, session.user.id);
  if (!carousel) {
    return c.json({ error: "Carousel not found" }, 404);
  }
  if (!carousel.imageUrls || carousel.imageUrls.length === 0) {
    return c.json({ error: "Carousel has no exported slides" }, 400);
  }
  if (!hasChannels()) {
    return c.json(
      { error: "Neither BUFFER_IG_CHANNEL_ID nor BUFFER_TIKTOK_CHANNEL_ID is configured in the environment" },
      500
    );
  }

  const results = await scheduleToChannels({
    text: buildPostText(carousel.caption, carousel.hashtags),
    title: carousel.title,
    assets: carousel.imageUrls,
    dueAt,
  });

  await updateCarousel(carouselId, {
    status: "scheduled",
    bufferIgId: results.igPostId || null,
    bufferTtId: results.ttPostId || null,
    dueAt,
  });

  return c.json(results);
});

export default app;
