import { normalizeText, tokenOverlapSimilarity } from "../topics/dedup";
import type { NewsItem } from "./fetch-news";

/**
 * "Two independent sources, or it does not exist."
 *
 * This is the corroboration rule lib/evidence/resolve-url.ts was built around and then lost:
 * a claim the model makes only counts when it also appears in something the model did not
 * write. That rule died there with grounded search — read the header comment in resolve-url.ts,
 * which says so plainly, and `verifyPageIdentity` now carries the weight instead. Here the rule
 * comes back in its original form, because feeds give it what it needs: several parties
 * reporting independently.
 *
 * Independence is by feed GROUP, not host. A network's sibling titles republishing one wire
 * story is one source wearing two names, and counting it twice is how a single-source rumour
 * gets promoted to "corroborated".
 */

export interface StoryCluster {
  /** The longest headline in the cluster — least abbreviated, so most searchable. */
  headline: string;
  items: NewsItem[];
  /** Distinct independence keys. This is the number the gate is applied to. */
  groups: string[];
  publishers: string[];
  sourceUrls: string[];
  /** Newest publication time in the cluster, epoch ms; null when nothing was dated. */
  newestAt: number | null;
}

/**
 * How much headline overlap counts as "the same story".
 *
 * Token Dice, not Levenshtein: two outlets covering one release share the nouns and reorder
 * everything else ("OpenAI launches X for developers" / "X arrives from OpenAI, aimed at
 * devs"). 0.42 was picked against a live sample — below it, unrelated stories about the same
 * company started merging; above it, genuine pairs split apart.
 */
export const STORY_MATCH_THRESHOLD = 0.42;

/** Words that carry no story identity, so they cannot be what makes two headlines "match". */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "its", "new", "now", "how", "why",
  "what", "you", "your", "are", "was", "will", "has", "have", "can", "but", "not", "all",
  "out", "get", "gets", "more", "than", "into", "about", "after", "before", "over", "just",
  "here", "says", "said", "could", "would", "should", "may", "might", "one", "two",
]);

function keyTokens(title: string): Set<string> {
  return new Set(
    normalizeText(title)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/**
 * How many independent publishers use each token.
 *
 * Counted per PUBLISHER, not per headline, and that distinction is not cosmetic. Google's
 * newsroom filed four separate posts about its new laptop, which pushed `googlebook` to five
 * occurrences and out of the "rare" band — so the single most distinctive word in the biggest
 * story of the sweep stopped counting as a name, and the story failed to cluster at all. A
 * publisher repeating itself must not make a word common.
 *
 * This is what separates "both headlines say `data` and `centers`" from "both headlines say
 * `bungie`". Without it, two shared generic tech nouns were enough to merge stories, and they
 * did: a Verge piece on California's AI data-centre bills was absorbed into an EU
 * data-centre-disclosure story, giving one story two "independent" sources it never had.
 * A false merge is the worst failure here — it manufactures corroboration.
 */
export function documentFrequency(items: { title: string; group: string }[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const item of items) {
    for (const token of keyTokens(item.title)) {
      const groups = seen.get(token) ?? new Set<string>();
      groups.add(item.group);
      seen.set(token, groups);
    }
  }
  const df = new Map<string, number>();
  for (const [token, groups] of seen) df.set(token, groups.size);
  return df;
}

/**
 * A token is distinctive when few publishers use it AND it names something.
 *
 * Pure numbers are excluded by name. "$200 off" and "100 open problems" share the token
 * `200`/`100` with anything else quoting a figure, and a number is rare by construction — a
 * TechCrunch Disrupt ticket promo and a Wired coupon post were merged on `save` + `200`
 * alone, which is how a discount code became a corroborated tech story.
 */
export function rarityTest(df: Map<string, number>, publisherCount: number): (token: string) => boolean {
  // Half the publishers, floor 3. A word every outlet reaches for — `google`, `openai`, `data`
  // — is vocabulary, not identity; a word four of nine outlets used on one day is a name.
  const ceiling = Math.max(3, Math.ceil(publisherCount * 0.5));
  return (token: string) => !/^\d+$/.test(token) && (df.get(token) ?? 0) <= ceiling;
}

/**
 * The distinctive NAMES in a headline.
 *
 * Capitalised mid-sentence and rare in the sweep: that combination is a cheap, surprisingly
 * sharp named-entity detector over headlines, and it fixes the one false merge that survived
 * every frequency rule. "California tightens rules on AI data center energy and water use"
 * and "The EU will force data centers to disclose their energy and water use" are two
 * different laws on two continents, and they share four rare words — `data`, `energy`,
 * `water`, `use` — because the only thing that distinguishes them is the jurisdiction. Nouns
 * cannot tell those apart. Names can: one says California, the other says EU, and they share
 * no name at all.
 *
 * Capitalisation alone would be no signal in first position — every headline capitalises its
 * first word — so rarity carries that case: a capitalised FIRST word counts as a name only
 * when it is also rare, which admits "Bungie says…" and "X will now tell users…" while
 * "The EU will force…" and "How to…" are filtered as stopwords. Rarity does the same work
 * for feeds that Title Case Every Word: `Googlebook` survives it, `Want` does not.
 */
export function entityTokens(title: string, isRare: (token: string) => boolean): Set<string> {
  const words = title.split(/\s+/);
  const out = new Set<string>();
  words.forEach((word) => {
    if (!/^[\u0022\u0027\u2018\u201c(\[]*[A-Z]/.test(word)) return;
    const token = normalizeText(word).replace(/\s+/g, "");
    if (token.length < 3 || STOPWORDS.has(token)) return;
    if (!isRare(token)) return;
    out.add(token);
  });
  return out;
}

/**
 * Do these two headlines describe one story?
 *
 * A shared distinctive NAME is required first — see `entityTokens`. Without it, headlines
 * that share only their common nouns can pass either test below, and they did.
 *
 * Then two tests, either sufficient:
 *
 * 1. Dice overlap above the threshold — catches straight rephrasing.
 * 2. Two shared distinctive names plus enough of the shorter headline in common — catches the
 *    pair Dice misses, where one outlet writes a long headline and another a short one about
 *    the same release.
 *
 * All of it is deliberately biased towards precision, and it costs real clusters: a TechCrunch
 * piece on OpenAI's maths advisory group and Terence Tao's own post about it share no
 * capitalised rare word, so they stay apart and the story is dropped as single-source. That is
 * the right way to be wrong here. A missed story costs one topic out of a sweep that produces
 * several; a false merge INVENTS corroboration, and the whole point of this module is that
 * corroboration cannot be invented.
 *
 * When `isRare` is omitted (direct unit-test calls) the name requirement is skipped and rule 2
 * falls back to the stricter 0.6 ratio.
 */
export function sameStory(
  a: string,
  b: string,
  opts?: { threshold?: number; isRare?: (token: string) => boolean }
): boolean {
  const threshold = opts?.threshold ?? STORY_MATCH_THRESHOLD;
  const dice = tokenOverlapSimilarity(a, b);

  if (!opts?.isRare) {
    if (dice >= threshold) return true;
    const ta0 = keyTokens(a);
    const tb0 = keyTokens(b);
    if (ta0.size < 2 || tb0.size < 2) return false;
    let shared0 = 0;
    for (const t of ta0) if (tb0.has(t)) shared0++;
    return shared0 >= 2 && shared0 / Math.min(ta0.size, tb0.size) >= 0.6;
  }

  const namesA = entityTokens(a, opts.isRare);
  const namesB = entityTokens(b, opts.isRare);
  const sharedNames = [...namesA].filter((n) => namesB.has(n));
  if (sharedNames.length === 0) return false;

  if (dice >= threshold) return true;

  const ta = keyTokens(a);
  const tb = keyTokens(b);
  if (ta.size < 2 || tb.size < 2) return false;

  const shared: string[] = [];
  for (const t of ta) if (tb.has(t)) shared.push(t);
  if (shared.length < 2) return false;

  // One shared name is enough here because the gate above already required it, and the name
  // is the part that carries identity. Demanding two lost real pairs — TechCrunch's
  // "Google's $899 Googlebook is a bet…" and Wired's "…You'll Probably Want a Googlebook
  // Laptop" share exactly one distinctive name, `Googlebook`, and are plainly one story.
  //
  // The length floor is what keeps that generosity honest. A ratio is cheap on a short
  // headline: "Why is the Apple Mac Studio so expensive?" has five content words, so two
  // shared ones reach 0.4 — and that is how a Mac Studio price explainer got counted as a
  // third source for a Mac mini review. Six words minimum on the shorter side.
  const shorter = Math.min(ta.size, tb.size);
  return shorter >= 6 && shared.length / shorter >= 0.4;
}

/**
 * Group items into stories.
 *
 * Each item joins the cluster it matches BEST, not the first one it matches. "First match"
 * made the result depend on feed order, and worse, it lost items: an item whose publisher was
 * already in the matched cluster used to be discarded outright, so TechCrunch's Googlebook
 * story vanished after an earlier TechCrunch headline had claimed the cluster it belonged to.
 *
 * A publisher that files three pieces on one story contributes all of them, but counts once —
 * `groups` is a set, and `sourceUrls` keeps the first URL per publisher, so a prolific outlet
 * cannot inflate either the independence count or the citation list.
 */
export function clusterStories(
  items: NewsItem[],
  threshold = STORY_MATCH_THRESHOLD
): StoryCluster[] {
  const df = documentFrequency(items);
  const isRare = rarityTest(df, new Set(items.map((i) => i.group)).size);
  const match = (a: string, b: string) => sameStory(a, b, { threshold, isRare });

  const clusters: NewsItem[][] = [];

  for (const item of items) {
    let best: NewsItem[] | null = null;
    let bestScore = -1;
    for (const cluster of clusters) {
      if (!cluster.some((member) => match(member.title, item.title))) continue;
      const score = Math.max(...cluster.map((m) => tokenOverlapSimilarity(m.title, item.title)));
      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }
    if (best) best.push(item);
    else clusters.push([item]);
  }

  return clusters.map((members) => {
    const groups = [...new Set(members.map((m) => m.group))];
    const dates = members.map((m) => m.publishedAt).filter((d): d is number => d !== null);

    // One citation per publisher, in feed order.
    const firstPerGroup = new Map<string, string>();
    for (const m of members) if (!firstPerGroup.has(m.group)) firstPerGroup.set(m.group, m.url);

    return {
      headline: members.reduce((longest, m) => (m.title.length > longest.length ? m.title : longest), ""),
      items: members,
      groups,
      publishers: [...new Set(members.map((m) => m.publisher))],
      sourceUrls: [...firstPerGroup.values()],
      newestAt: dates.length ? Math.max(...dates) : null,
    };
  });
}

export interface CorroborationSplit {
  /** Clusters backed by at least `minSources` independent groups, one of them independent press. */
  passed: StoryCluster[];
  /** Everything else, kept so a run can report WHY a story was dropped. */
  rejected: StoryCluster[];
}

/**
 * Apply the gate. Default two, which is the whole point of the rule.
 *
 * Single-source clusters are the majority of any feed sweep and most of them are real; they
 * are still dropped, because "real" is not the bar. The bar is "confirmed by someone who did
 * not get it from the same press release", and nothing here can tell the difference for a
 * lone obscure item.
 */
export function splitByCorroboration(
  clusters: StoryCluster[],
  minSources = 2
): CorroborationSplit {
  const passed: StoryCluster[] = [];
  const rejected: StoryCluster[] = [];
  for (const cluster of clusters) {
    const enough = cluster.groups.length >= minSources;
    // A vendor blog plus a second vendor blog is two sources and no witnesses. Every accepted
    // cluster needs at least one outlet that does not work for the company in the story.
    const witnessed = cluster.items.some((item) => !item.primary);
    (enough && witnessed ? passed : rejected).push(cluster);
  }
  // Best corroborated first, then most recent: what a human would read top-down.
  passed.sort((a, b) => b.groups.length - a.groups.length || (b.newestAt ?? 0) - (a.newestAt ?? 0));
  return { passed, rejected };
}
