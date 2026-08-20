import type { LanguageModel } from "ai";
import { createTopic, getTopics, type Topic, type TopicCategory } from "./bank";
import { generateTopicBatch } from "./generator";
import { MODE_COUNTS, scheduleDates, type PlanMode } from "./schedule";

export interface GenerateTopicsInput {
  mode: PlanMode;
  count?: number;
  category?: TopicCategory;
  focusArea?: string;
  directives?: string;
  research?: boolean;
  startDate?: string; // calendar anchor for weekly/monthly
}

/**
 * Generate a topic batch and persist it — shared by the server action (UI)
 * and the x-api-key route (external automation), so both paths schedule
 * dates identically.
 */
export async function generateAndSaveTopics(
  userId: string,
  model: LanguageModel,
  input: GenerateTopicsInput
): Promise<Topic[]> {
  const mode = input.mode;
  const count =
    mode === "ideas" ? Math.min(Math.max(input.count ?? 7, 1), 31) : MODE_COUNTS[mode];

  // Fetch recent topics to calculate category distribution and dedup against
  const existing = await getTopics(userId, { limit: 100 }).catch(() => []);
  const existingTopics = existing.map((t) => ({ title: t.title, category: t.category }));

  const categoryDistribution: Record<string, number> = {};
  for (const t of existing) {
    if (t.category) {
      categoryDistribution[t.category] = (categoryDistribution[t.category] || 0) + 1;
    }
  }

  const generated = await generateTopicBatch(model, {
    mode,
    count,
    category: input.category,
    focusArea: input.focusArea,
    directives: input.directives,
    research: input.research,
    existingTopics,
    categoryDistribution,
  });

  const start = input.startDate ? new Date(input.startDate) : new Date();
  const dates = scheduleDates(mode, start, generated.length);

  const saved: Topic[] = [];
  for (let i = 0; i < generated.length; i++) {
    const t = generated[i];
    saved.push(
      await createTopic({
        userId,
        title: t.title,
        category: t.category,
        description: t.description,
        keywords: t.keywords,
        angle: t.angle,
        priority: t.priority,
        scheduledDate: dates[i],
      })
    );
  }
  return saved;
}
