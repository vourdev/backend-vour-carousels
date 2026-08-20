import { Hono } from "hono";
import { defaultModel, resolveModel, type ModelId } from "../../lib/ai/registry";
import {
  createTopic,
  deleteTopic,
  getTopic,
  getTopics,
  updateTopic,
  type TopicCategory,
  type TopicStatus,
} from "../../lib/topics/bank";
import { expandTopicToBrief } from "../../lib/topics/generator";
import { generateAndSaveTopics, type GenerateTopicsInput } from "../../lib/topics/service";
import { extractAndSaveTopicsFromNotes } from "../../lib/research/agent";

const app = new Hono<{ Variables: { session: any } }>();

/** Every handler here is user-scoped: the session owns the row, never the request body. */
function userId(c: any): string {
  return (c.get("session") as { user: { id: string } }).user.id;
}

app.get("/", async (c) => {
  const status = c.req.query("status") as TopicStatus | undefined;
  const category = c.req.query("category") as TopicCategory | undefined;
  const limitRaw = c.req.query("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const topics = await getTopics(userId(c), {
    status,
    category,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return c.json({ topics });
});

app.post("/", async (c) => {
  const body = await c.req.json();
  if (!body?.title?.trim()) {
    return c.json({ error: "Missing title" }, 400);
  }
  const topic = await createTopic({ ...body, userId: userId(c) });
  return c.json({ topic });
});

app.patch("/:id", async (c) => {
  const patch = await c.req.json();
  const topic = await updateTopic(c.req.param("id"), userId(c), patch);
  return c.json({ topic });
});

app.delete("/:id", async (c) => {
  await deleteTopic(c.req.param("id"), userId(c));
  return c.json({ success: true });
});

/**
 * Extract topic candidates from raw notes and save them to the topic bank.
 */
app.post("/generate-from-notes", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { rawNotes?: string; modelId?: ModelId };
  if (!body?.rawNotes?.trim()) {
    return c.json({ error: "Missing or empty rawNotes in request body" }, 400);
  }

  const modelId = body.modelId ?? defaultModel();
  if (!modelId) {
    return c.json({ error: "No AI model API keys configured in .env" }, 500);
  }

  const topics = await extractAndSaveTopicsFromNotes(
    userId(c),
    resolveModel(modelId),
    body.rawNotes,
    { status: "idea", source: "notes-extraction" }
  );

  return c.json({ topics, count: topics.length });
});

/**
 * Batch-generate topics into the bank. The model is resolved here rather than
 * taken from the request: the caller picks what to write about, not what writes it.
 */
app.post("/generate", async (c) => {
  const input = (await c.req.json()) as GenerateTopicsInput;
  if (!["ideas", "weekly", "monthly"].includes(input?.mode)) {
    return c.json({ error: `Invalid mode "${input?.mode}" — use ideas | weekly | monthly` }, 400);
  }

  const modelId = defaultModel();
  if (!modelId) {
    return c.json({ error: "No AI model API keys configured in .env" }, 500);
  }

  const topics = await generateAndSaveTopics(userId(c), resolveModel(modelId), input);
  return c.json({ topics, count: topics.length });
});


/** Expand one banked topic into a full Markdown brief, ready for the plan stage. */
app.post("/:id/brief", async (c) => {
  const { modelId } = (await c.req.json().catch(() => ({}))) as { modelId?: ModelId };
  const id = c.req.param("id");

  const topic = await getTopic(id, userId(c));
  if (!topic) {
    return c.json({ error: "Topic not found" }, 404);
  }

  const resolved = modelId ?? defaultModel();
  if (!resolved) {
    return c.json({ error: "No AI model API keys configured in .env" }, 500);
  }

  const brief = await expandTopicToBrief(topic, resolveModel(resolved));
  return c.json({ brief });
});

export default app;
