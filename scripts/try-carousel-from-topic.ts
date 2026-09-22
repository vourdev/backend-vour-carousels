/**
 * TASK 9, carousel half: brief + slide plan from a news-discovery topic, nothing published.
 *
 *   npx tsx --env-file-if-exists=.env scripts/try-carousel-from-topic.ts
 *
 * Runs the same first half of `createAndPublishCarousel` the automation route runs — including
 * the enrichment the route reads off the bank row — and then asserts the two things that
 * matter: no URL from a news outlet anywhere in the plan, and no image pulled from anywhere.
 * Stops before capture and before Buffer.
 */
import { getTopics } from "../src/lib/topics/bank";
import { resolveOperatorUserId } from "../src/middleware/service-auth";
import { defaultModel, resolveModel } from "../src/lib/ai/registry";
import { generateBrief, generateSlidePlan, stripUnfulfillableEvidence } from "../src/lib/ai/generate";
import { fulfillWebEvidence } from "../src/lib/evidence/fulfill";
import { NEWS_HOSTS } from "../src/lib/news/feeds";

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user");
const topic = (await getTopics(userId, { limit: 300 })).find((t) => t.source === "news-discovery");
if (!topic) throw new Error('no topic with source="news-discovery"');

const modelId = defaultModel();
if (!modelId) throw new Error("no model configured");
const model = resolveModel(modelId);

console.log(`TOPIC  ${topic.title}`);
console.log(`  visualHint=${topic.visualHint}  sources=${topic.sourceUrls?.length ?? 0}`);

// Exactly what routes/automation/generate.ts builds for a news-discovery row.
const visual =
  topic.visualHint === "changelog"
    ? "Visual: ini rilis/update — rinci perubahannya sebagai daftar (timeline / checklist / datatable)."
    : "Visual: ini berita naratif — tetap editorial (illustration / concept), bukan daftar perubahan.";
const enrichment = [
  topic.description ? `\nKonteks dari berita: ${topic.description}` : "",
  `\n${visual}`,
  "\nDILARANG memakai gambar apa pun dari artikel berita sumber.",
].join("");

const idea = `${topic.title} (fokus: Panduan Praktis, Tips & Tutorial)${enrichment}`;
console.log("\n--- idea handed to the brief stage ---\n" + idea);

const brief = await generateBrief(idea, model);
console.log(`\nBRIEF ${brief.length} chars`);

const drafted = await generateSlidePlan(brief, model, { underusedTypes: [], stats: [] });
const { plan: withEvidence } = await fulfillWebEvidence(drafted, { path: "automation" });
const plan = stripUnfulfillableEvidence(withEvidence);

const slides: any[] = (plan as any).slides ?? [];
console.log(`\nPLAN ${slides.length} slides`);
for (const [i, s] of slides.entries()) {
  const mockup = s.mockup?.type ?? s.hook?.kind ?? "—";
  console.log(`  ${String(i + 1).padStart(2)}. ${mockup.padEnd(14)} ${(s.title ?? s.headline ?? "").toString().slice(0, 62)}`);
}

/* ── Assertions ────────────────────────────────────────────────────────── */
const serialised = JSON.stringify(plan);
const newsHostHits = NEWS_HOSTS.filter((h) => serialised.includes(h));
const imageUrls = serialised.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|gif|webp|avif)/gi) ?? [];
const screenshotSlides = slides.filter((s) => s.mockup?.type === "screenshot" || s.mockup?.type === "image");

console.log("\nCHECKS");
console.log(`  news-outlet host anywhere in plan : ${newsHostHits.length === 0 ? "none ✓" : newsHostHits.join(", ") + " ✗"}`);
console.log(`  image URLs in plan               : ${imageUrls.length === 0 ? "none ✓" : imageUrls.join(", ") + " ✗"}`);
console.log(`  screenshot/image mockups         : ${screenshotSlides.length === 0 ? "none ✓" : screenshotSlides.length + " ✗"}`);
const mockups = slides.map((s) => s.mockup?.type).filter(Boolean);
const releaseShaped = mockups.filter((m) => ["timeline", "checklist", "datatable", "comparison", "steps"].includes(m));
console.log(`  release-shaped mockups used      : ${releaseShaped.join(", ") || "(none)"}`);
process.exit(0);
