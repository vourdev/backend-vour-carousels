import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { aiCallDefaults } from "../ai/registry";
import { createTopic, getTopics, type Topic, type TopicStatus, type VisualHint } from "../topics/bank";
import { isDuplicateTopic } from "../topics/dedup";
import { resolveOmnirouteModelById } from "../ai/registry";
import { fetchNewsItems, type NewsItem } from "./fetch-news";
import { searchNewsItems, searchModelId } from "./search-news";
import { clusterStories, splitByCorroboration, type StoryCluster } from "./corroborate";

/**
 * News discovery for the Topic Bank.
 *
 * Headlines come from two places, and both are treated identically once they arrive: the
 * publishers' own RSS feeds, and — when `NEWS_SEARCH_MODEL` names a search-capable OmniRoute
 * model — live grounded search. Search widens coverage; it earns no exemptions.
 *
 * Three gates, in this order, and a candidate has to clear all three:
 *
 *   1. CORROBORATION — at least two independent publishers, one of them not the vendor whose
 *      news it is. Pure code, no model involved (./corroborate.ts).
 *   2. SIGNIFICANCE — does this matter to a junior/mid Indonesian developer? A model decides,
 *      but only over headlines and summaries that real outlets published. It is judging text
 *      it did not write, which is the whole reason this is safe to automate.
 *   3. DEDUP — nothing that looks like a topic already in the bank.
 *
 * What the model is NOT allowed to supply: the URLs. Those come from the feed, attached to the
 * cluster the model picked by index. A model asked for sources invents plausible ones, and an
 * invented citation is worse than none — it looks like provenance.
 */

/* ── What the model may answer ─────────────────────────────────────────── */

const pickSchema = z.object({
  /** Index into the corroborated list handed to the model. */
  index: z.number().int().min(0),
  title: z.string().min(8).max(120),
  description: z.string().min(20).max(500),
  keywords: z.array(z.string()).min(1).max(6),
  /** Why an Indonesian junior/mid dev should care. Kept for the human reviewing the bank. */
  whyRelevant: z.string().min(10).max(300),
  visual: z.enum(["changelog", "illustration"]),
  priority: z.number().int().min(1).max(10).catch(6),
});

const pickListSchema = z.object({
  picks: z.array(pickSchema),
});

export type NewsPick = z.infer<typeof pickSchema>;

/* ── Prompting ─────────────────────────────────────────────────────────── */

const SYSTEM = `Kamu editor teknologi untuk Vour (vour.dev) — konten edukasi buat developer
junior/menengah di Indonesia. Gaya: kasual, "gw"/"lu", senior-dev-ke-junior, tegas soal fakta.

Kamu dikasih daftar BERITA TEKNOLOGI NYATA yang sudah dikonfirmasi minimal 2 media independen.
Tugasmu MENYARING, bukan mencari: pilih HANYA yang benar-benar signifikan buat audiens Vour.

LOLOS kalau berita itu mengubah cara developer kerja atau mengambil keputusan teknis:
- rilis/update tool, framework, runtime, bahasa, model AI, SDK, database, editor
- perubahan harga/kuota/lisensi/limit yang kena ke developer
- breaking change, deprecation, celah keamanan, insiden platform besar
- pergeseran nyata di ekosistem dev (akuisisi/kebijakan yang mengubah tooling)

TOLAK — jangan dipaksakan jadi topik:
- gadget consumer, review hardware, game, hiburan, gosip perusahaan
- ronde funding/IPO/valuasi, kecuali produknya dipakai developer sehari-hari
- promo, tiket konferensi, kupon, listicle belanja
- politik/regulasi umum yang tidak mengubah pekerjaan developer
- berita yang cuma "menarik" tapi tidak actionable buat junior dev

Lebih baik mengembalikan 1 topik kuat (atau NOL) daripada memaksa 5 topik lemah.

Untuk tiap berita yang LOLOS, tulis:
- "index": angka dari daftar, apa adanya
- "title": judul topik Bahasa Indonesia, gaya Vour, spesifik, TIDAK clickbait, maks 120 karakter.
  Judul boleh menahan jawaban, tapi tidak boleh menjanjikan lebih dari yang bisa dibahas.
- "description": 2-3 kalimat — apa yang terjadi dan kenapa ini penting secara teknis
- "keywords": 3-5 kata kunci teknis
- "whyRelevant": 1 kalimat kenapa developer junior/menengah Indonesia perlu tahu
- "visual": "changelog" kalau beritanya RILIS/UPDATE terstruktur (ada versi baru dan daftar
  perubahan yang bisa dirinci). "illustration" untuk berita naratif — kebijakan, insiden,
  pergeseran ekosistem, apa pun yang bukan daftar perubahan.
- "priority": 1-10 (10 = paling on-brand dan paling mendesak)

Balas HANYA JSON valid: { "picks": [ ... ] }. Kalau tidak ada yang layak: { "picks": [] }.
JANGAN mengarang berita yang tidak ada di daftar. JANGAN menulis URL — sumber sudah dicatat
sistem. JANGAN menambah teks di luar JSON.`;

function renderCandidates(clusters: StoryCluster[]): string {
  return clusters
    .map((c, i) => {
      const when = c.newestAt ? new Date(c.newestAt).toISOString().slice(0, 16).replace("T", " ") : "tanggal tidak tercatat";
      const summary = c.items.find((item) => item.summary)?.summary ?? "";
      const lines = [
        `[${i}] ${c.headline}`,
        `    dikonfirmasi ${c.groups.length} media: ${c.publishers.join(", ")} — ${when} UTC`,
      ];
      if (summary) lines.push(`    ringkas: ${summary.slice(0, 320)}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function extractAndParseJson(rawText: string): unknown {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const open = cleaned.indexOf("{");
  const close = cleaned.lastIndexOf("}");
  if (open !== -1 && close > open) cleaned = cleaned.slice(open, close + 1);
  return JSON.parse(cleaned);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ask the model which corroborated stories are worth a Vour topic. */
export async function selectSignificant(
  clusters: StoryCluster[],
  model: LanguageModel,
  maxTopics: number
): Promise<NewsPick[]> {
  if (clusters.length === 0) return [];

  const prompt = [
    `BERITA TEKNOLOGI TERKONFIRMASI (${clusters.length} kandidat):`,
    "",
    renderCandidates(clusters),
    "",
    `Pilih MAKSIMAL ${maxTopics} yang paling signifikan buat audiens Vour. Boleh kurang. Boleh nol.`,
    "Balas JSON saja.",
  ].join("\n");

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { text } = await generateText({ ...aiCallDefaults(), model, system: SYSTEM, prompt });
      const parsed = pickListSchema.parse(extractAndParseJson(text));

      // An index the model invented points at no cluster, so it has no sources — the one thing
      // a topic here may not be missing.
      const valid = parsed.picks.filter((p) => {
        if (p.index < clusters.length) return true;
        console.warn(`[news-discovery] dropping pick with out-of-range index ${p.index}`);
        return false;
      });

      // Two picks on one cluster would publish the same story twice under different titles.
      const seen = new Set<number>();
      return valid.filter((p) => (seen.has(p.index) ? false : (seen.add(p.index), true))).slice(0, maxTopics);
    } catch (err) {
      lastError = err;
      console.warn(
        `[news-discovery] significance pass ${attempt}/3 failed:`,
        err instanceof Error ? err.message : err
      );
      if (attempt < 3) await delay(attempt * 2500);
    }
  }
  throw new Error(
    `News significance filter failed after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/* ── The run ───────────────────────────────────────────────────────────── */

export interface DiscoverOptions {
  userId: string;
  /** How far back to read the feeds. */
  withinHours?: number;
  /** Independent publishers required. Below 2 the corroboration rule is off; don't. */
  minSources?: number;
  maxTopics?: number;
  /**
   * Status the saved rows get. Defaults to "idea", which is what both consumers already read:
   * `GET /topic/next` (carousel) hands out "approved" then "idea", and `GET /next-for-blog`
   * ignores status entirely. "pending_review" would park them where the carousel cron cannot
   * see them until a human approves — correct if you want a human in the loop, and then it is
   * no longer zero-integration.
   */
  status?: TopicStatus;
  /**
   * Add live grounded search to the feed sweep. Defaults to on when `NEWS_SEARCH_MODEL` is
   * set. Pass false to run on feeds alone — which is what happens anyway if the model is
   * unreachable, so a search outage only ever costs coverage, never the run.
   */
  useSearch?: boolean;
  /** Run every gate and report, write nothing. */
  dryRun?: boolean;
}

export interface SkippedTopic {
  headline: string;
  reason: "single-source" | "not-significant" | "duplicate";
  detail: string;
}

export interface DiscoverResult {
  saved: Topic[];
  skipped: SkippedTopic[];
  stats: {
    itemsFetched: number;
    itemsFromSearch: number;
    feedsOk: number;
    feedsFailed: number;
    clusters: number;
    corroborated: number;
    picked: number;
    saved: number;
  };
  /** Per-feed outcome, so a dead feed is visible instead of just looking like a quiet news day. */
  feeds: { publisher: string; ok: boolean; count: number; detail?: string }[];
  /** Absent when search was off or unconfigured. */
  search?: { model: string; returned: number; malformed: number; unreachable: number; kept: number };
}

/** "fokus:" phrasing the brief pipeline already understands, plus the visual decision. */
function angleFor(visual: VisualHint): string {
  return visual === "changelog"
    ? "fokus: Rilis & Daftar Perubahan"
    : "fokus: Berita & Dampaknya ke Developer";
}

export async function discoverTrendingTopics(
  model: LanguageModel,
  opts: DiscoverOptions
): Promise<DiscoverResult> {
  const withinHours = opts.withinHours ?? 48;
  const minSources = Math.max(2, opts.minSources ?? 2);
  const maxTopics = Math.min(Math.max(opts.maxTopics ?? 3, 1), 10);

  const { items: feedItems, feeds } = await fetchNewsItems({ withinHours });

  // Grounded search, when one is configured. Its results join the same pool and face the same
  // corroboration rule — a story only search saw still needs a second independent publisher.
  let searchItems: NewsItem[] = [];
  let searchReport: DiscoverResult["search"];
  const wantSearch = opts.useSearch ?? true;
  const searchModel = wantSearch ? searchModelId() : null;
  if (searchModel) {
    const llm = resolveOmnirouteModelById(searchModel);
    if (!llm) {
      console.warn(`[news-discovery] NEWS_SEARCH_MODEL="${searchModel}" tapi OmniRoute belum dikonfigurasi`);
    } else {
      // `model` is the ordinary combo already resolved for the significance pass; it doubles as
      // the formatter that turns a chat-UI search answer into JSON.
      const found = await searchNewsItems(llm, { withinHours, maxResults: 20, formatter: model });
      searchItems = found.items;
      searchReport = { model: searchModel, ...found.stats };
    }
  }

  const items = [...feedItems, ...searchItems];
  const clusters = clusterStories(items);
  const { passed, rejected } = splitByCorroboration(clusters, minSources);

  console.log(
    `[news-discovery] ${feedItems.length} item dari ${feeds.filter((f) => f.ok).length}/${feeds.length} feed` +
      (searchReport ? ` + ${searchItems.length} dari pencarian (${searchReport.model})` : "") +
      ` → ${clusters.length} cluster → ${passed.length} terkonfirmasi ≥${minSources} sumber`
  );

  const skipped: SkippedTopic[] = rejected.map((c) => ({
    headline: c.headline,
    reason: "single-source" as const,
    detail:
      c.groups.length < minSources
        ? `hanya ${c.groups.length} sumber (${c.publishers.join(", ")}), butuh ${minSources} independen`
        : `semua sumber adalah newsroom pihak yang diberitakan (${c.publishers.join(", ")})`,
  }));

  const picks = passed.length ? await selectSignificant(passed, model, maxTopics) : [];
  const pickedIndexes = new Set(picks.map((p) => p.index));

  for (let i = 0; i < passed.length; i++) {
    if (pickedIndexes.has(i)) continue;
    skipped.push({
      headline: passed[i].headline,
      reason: "not-significant",
      detail: `terkonfirmasi ${passed[i].groups.length} sumber tapi tidak lolos filter signifikansi untuk audiens Vour`,
    });
  }

  // Dedup against the bank and within this batch, exactly as the other two entry points do.
  const existing = await getTopics(opts.userId, { limit: 200 }).catch(() => []);
  const seenTitles = existing.map((t) => t.title);

  const saved: Topic[] = [];
  for (const pick of picks) {
    const cluster = passed[pick.index];
    const dup = isDuplicateTopic(pick.title, seenTitles);
    if (dup.isDuplicate) {
      skipped.push({
        headline: cluster.headline,
        reason: "duplicate",
        detail: `"${pick.title}" ${(dup.similarity * 100).toFixed(0)}% mirip topik yang sudah ada: "${dup.matchedWith}"`,
      });
      continue;
    }

    if (opts.dryRun) {
      seenTitles.push(pick.title);
      console.log(`[news-discovery] DRY RUN, tidak disimpan: "${pick.title}" (${cluster.sourceUrls.length} sumber)`);
      continue;
    }

    saved.push(
      await createTopic({
        userId: opts.userId,
        title: pick.title,
        category: "trending",
        description: pick.description,
        keywords: pick.keywords,
        angle: angleFor(pick.visual),
        priority: pick.priority,
        status: opts.status ?? "idea",
        source: "news-discovery",
        targetAudienceFit: pick.whyRelevant,
        sourceUrls: cluster.sourceUrls,
        visualHint: pick.visual,
      })
    );
    seenTitles.push(pick.title);
  }

  return {
    saved,
    skipped,
    stats: {
      itemsFetched: items.length,
      itemsFromSearch: searchItems.length,
      feedsOk: feeds.filter((f) => f.ok).length,
      feedsFailed: feeds.filter((f) => !f.ok).length,
      clusters: clusters.length,
      corroborated: passed.length,
      picked: picks.length,
      saved: saved.length,
    },
    feeds,
    search: searchReport,
  };
}
