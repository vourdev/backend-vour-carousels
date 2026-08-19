import { generateObject, generateText, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateBrief } from "../ai/generate";
import { generatedTopicListSchema, type GeneratedTopic } from "./schema";
import type { PlanMode } from "./schedule";
import type { TopicCategory } from "./bank";

const VOUR_CONTEXT = `
Brand: Vour (vour.dev)
Creator: Muhammad Adhinugroho
Positioning: Building AI workflows, developer tools, automation, and digital products.

Target Audience: Junior/Mid developers (learning-focused)
Content Focus: 80% coding/AI/automation/productivity, 20% setup/gadgets
Tech Stack: Next.js, React, TypeScript, Prisma, PostgreSQL, AI workflows
Content Style: Educational carousel content (Instagram & TikTok)
Tone: Casual Indonesian, first-person "saya", senior-dev-to-junior, sedikit opinionated
North Star: "Developer yang builds AI workflows, tools, dan automation yang save people time."
`;

const TOPIC_GENERATION_SYSTEM = `You are a content strategist for Vour, an educational tech content brand targeting junior/mid developers in Indonesia.

${VOUR_CONTEXT}

Your task: generate carousel content topics that are:
1. Educational & practical (solve real problems)
2. Engaging for TikTok/Instagram audience (clickable titles)
3. Aligned with Vour's positioning (AI workflows, developer tools, automation)
4. Specific enough to fit an 8-slide carousel with clear learning outcomes
5. Written in casual Indonesian tone

Categories: ai-workflow, developer-tools, automation, nextjs, angular, productivity, tutorial, common-mistakes, case-study, deep-dive.

Good title examples:
- "JWT Itu Bukan Enkripsi" (common misconception)
- "3 AI Tools yang Save 5 Jam per Minggu" (specific benefit)
- "Kenapa Middleware Next.js Sering Bikin Bug" (problem-focused)
- "Docker Compose vs Kubernetes: Kapan Pakai Apa?" (comparison)

For every topic set "angle" like "fokus: Panduan Praktis" / "fokus: Kesalahan Umum" / "fokus: Konsep Mendalam", and "priority" 1-10 (10 = most on-brand + highest engagement potential).`;

const WEEK_RHYTHM = `Daily rhythm for each week (repeat per week when generating more than 7):
- Day 1: easy, accessible topic (broad appeal, high shareability)
- Day 2: tutorial/how-to (practical, actionable)
- Day 3: common mistakes (engaging, relatable)
- Day 4: deep-dive technical (for serious learners)
- Day 5: tools/productivity (weekend prep)
- Day 6: case study or comparison (analytical)
- Day 7: myth-busting or concept explanation (educational)
Never repeat the same category on consecutive days. Balance trending topics with evergreen content.`;

export interface TopicBatchOptions {
  mode: PlanMode;
  count: number;
  category?: TopicCategory;
  focusArea?: string;
  /** Free-text quality directives from the user (e.g. "cek berita dev terkini dulu"). */
  directives?: string;
  /** Run a live web-research pass (Gemini google_search grounding) before generating. */
  research?: boolean;
}

/**
 * Optional research pass: uses Gemini with Google Search grounding to pull
 * genuinely current dev trends/news, so "lihat news terkini dahulu" is real
 * data instead of the model's memory. Falls back to null (no research
 * context) when no Gemini key is configured or the call fails.
 */
export async function researchCurrentTrends(focusArea: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      tools: { google_search: google.tools.googleSearch({}) },
      prompt: `Search the web for what is happening RIGHT NOW (this week/month) in the developer world relevant to: ${focusArea}.
Summarize in 8-12 concise bullets: new releases, breaking changes, trending tools/frameworks, viral dev discussions, and common pain points being talked about. Include names + versions where relevant. Plain text bullets only.`,
    });
    return text.trim() || null;
  } catch (err) {
    console.error("trend research failed (continuing without it):", err);
    return null;
  }
}

export async function generateTopicBatch(
  model: LanguageModel,
  options: TopicBatchOptions
): Promise<GeneratedTopic[]> {
  const { mode, count } = options;
  const focusArea =
    options.focusArea ||
    "trending developer topics and common learning gaps for junior/mid developers";

  const researchContext = options.research ? await researchCurrentTrends(focusArea) : null;

  const sections = [
    `Generate EXACTLY ${count} carousel content topics for Vour.`,
    options.category
      ? `Focus ONLY on category: ${options.category}`
      : "Mix categories based on Vour's content strategy (80% technical, 20% productivity/tools).",
    `Focus Area: ${focusArea}`,
    mode !== "ideas"
      ? `These topics form a ${mode === "weekly" ? "1-week (7 days)" : "4-week (28 days)"} daily posting calendar, in day order.\n${WEEK_RHYTHM}`
      : "These are backlog ideas — optimize for variety and evergreen value.",
    researchContext
      ? `CURRENT TRENDS & NEWS (from live web research — ground at least half of the topics in these):\n${researchContext}`
      : "",
    options.directives
      ? `ADDITIONAL QUALITY DIRECTIVES from the user (MUST follow):\n${options.directives}`
      : "",
    `Every title must be catchy & clickable in Indonesian. No duplicate or near-duplicate topics.`,
  ].filter(Boolean);

  const { object } = await generateObject({
    model,
    schema: generatedTopicListSchema,
    system: TOPIC_GENERATION_SYSTEM,
    prompt: sections.join("\n\n"),
  });

  return object.topics.slice(0, count);
}

/**
 * Expand a saved topic into a full carousel brief using the CANONICAL brief
 * pipeline (lib/ai briefSystem) — one brief format across the whole app.
 */
export async function expandTopicToBrief(
  topic: {
    title: string;
    description?: string;
    angle?: string;
    category: TopicCategory;
    keywords?: string[];
  },
  model: LanguageModel
): Promise<string> {
  const idea = [
    `Topik: ${topic.title}`,
    `Kategori: ${topic.category}`,
    topic.description ? `Deskripsi: ${topic.description}` : "",
    topic.angle ? `Angle: ${topic.angle}` : "",
    topic.keywords?.length ? `Keywords: ${topic.keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return generateBrief(idea, model);
}
