import type { GeneratedTopic } from "./schema";

/**
 * Clean and normalize a string for semantic comparison:
 * lowercase, strip emojis, punctuation, and extra whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Standard Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Levenshtein similarity ratio between 0 and 1.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(normA, normB);
  return 1.0 - dist / maxLen;
}

/**
 * Token Dice similarity: measures word overlap using Sørensen–Dice coefficient:
 * 2 * |A ∩ B| / (|A| + |B|).
 * Catches paraphrases and word reordering with high fidelity.
 */
export function tokenOverlapSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeText(a).split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(normalizeText(b).split(/\s+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  return (2 * intersection) / (wordsA.size + wordsB.size);
}


/**
 * Composite similarity score combining Levenshtein and Token Overlap.
 */
export function computeTitleSimilarity(titleA: string, titleB: string): number {
  const lev = levenshteinSimilarity(titleA, titleB);
  const token = tokenOverlapSimilarity(titleA, titleB);
  return Math.max(lev, token);
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedWith?: string;
  similarity: number;
}

/**
 * Checks if a title is a duplicate against a list of existing titles.
 */
export function isDuplicateTopic(
  newTitle: string,
  existingTitles: string[],
  threshold = 0.70
): DuplicateCheckResult {
  let highestSim = 0;
  let closestMatch: string | undefined;

  for (const existing of existingTitles) {
    const sim = computeTitleSimilarity(newTitle, existing);
    if (sim > highestSim) {
      highestSim = sim;
      closestMatch = existing;
    }
  }

  return {
    isDuplicate: highestSim >= threshold,
    matchedWith: highestSim >= threshold ? closestMatch : undefined,
    similarity: highestSim,
  };
}

/**
 * Filters out duplicate topics from a candidate list against existing titles
 * as well as intra-batch duplicates.
 */
export function filterDuplicateTopics(
  candidates: GeneratedTopic[],
  existingTitles: string[],
  threshold = 0.70
): GeneratedTopic[] {
  const accepted: GeneratedTopic[] = [];
  const allSeenTitles = [...existingTitles];

  for (const candidate of candidates) {
    const dup = isDuplicateTopic(candidate.title, allSeenTitles, threshold);
    if (!dup.isDuplicate) {
      accepted.push(candidate);
      allSeenTitles.push(candidate.title);
    } else {
      console.warn(
        `[dedup] Flagged duplicate topic: "${candidate.title}" (matches "${dup.matchedWith}" with similarity ${(dup.similarity * 100).toFixed(1)}%)`
      );
    }
  }

  return accepted;
}
