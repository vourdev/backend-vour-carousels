import { Hono } from "hono";
import { uploadImage } from "../../lib/publish/cloudinary";
import { scheduleBufferPost } from "../../lib/publish/buffer";
import type { SlidePlan } from "../../lib/ds/schema";

const app = new Hono();

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

  const igChannelId = process.env.BUFFER_IG_CHANNEL_ID;
  const ttChannelId = process.env.BUFFER_TIKTOK_CHANNEL_ID;

  if (!igChannelId && !ttChannelId) {
    return c.json(
      { error: "Neither BUFFER_IG_CHANNEL_ID nor BUFFER_TIKTOK_CHANNEL_ID is configured in the environment" },
      500
    );
  }

  const hashtagsStr = plan.hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const text = plan.caption ? `${plan.caption}\n\n${hashtagsStr}` : hashtagsStr;

  const results: { igPostId?: string; ttPostId?: string } = {};

  if (igChannelId) {
    results.igPostId = await scheduleBufferPost({
      channelId: igChannelId,
      text,
      assets: urls,
      dueAt,
    });
  }

  if (ttChannelId) {
    results.ttPostId = await scheduleBufferPost({
      channelId: ttChannelId,
      text,
      assets: urls,
      dueAt,
      isTikTok: true,
      title: plan.title,
    });
  }

  return c.json(results);
});

export default app;
