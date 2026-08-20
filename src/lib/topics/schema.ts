import { z } from "zod";

export const TOPIC_CATEGORIES = [
  "ai-workflow",
  "developer-tools",
  "automation",
  "nextjs",
  "angular",
  "productivity",
  "tutorial",
  "common-mistakes",
  "case-study",
  "deep-dive",
  // Research agent categories
  "evergreen",
  "trending",
  "personal",
  "product",
] as const;

export const TOPIC_STATUSES = [
  "idea", "queued", "generated", "published", "archived",
  // Research agent statuses
  "pending_review", "approved", "rejected",
] as const;

// AI output can hallucinate a category — coerce to "tutorial" instead of failing the batch.
const categoryField = z
  .string()
  .transform((raw) => {
    const slug = raw.trim().toLowerCase();
    return (TOPIC_CATEGORIES as readonly string[]).includes(slug) ? slug : "tutorial";
  })
  .pipe(z.enum(TOPIC_CATEGORIES));

export const generatedTopicSchema = z.object({
  title: z.string().min(4).max(120),
  category: categoryField,
  description: z.string().max(500),
  keywords: z.array(z.string()).min(1).max(6),
  angle: z.string().max(120),
  priority: z.number().int().min(1).max(10).catch(5),
});

export const generatedTopicListSchema = z.object({
  topics: z.array(generatedTopicSchema).min(1),
});

export type GeneratedTopic = z.infer<typeof generatedTopicSchema>;
