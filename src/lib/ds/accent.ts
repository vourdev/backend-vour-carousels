/**
 * `**word**` in a headline is the brief's notation, not the plan's.
 *
 * The brief prompt marks the accent word with double asterisks and the plan step is meant
 * to lift it into the separate `accentWord` field. Models routinely copy the headline
 * across verbatim instead, and the markers then print on the canvas.
 *
 * Shared by the repair layer and the renderer because only one of them is guaranteed to
 * run. `/api/assemble` casts a plan and renders it without parsing, so a slide reaching
 * the wizard's preview never passes through `repairSlidePlan` — the same reason
 * `compressFlowSteps` had to be called from the renderer as well as from the schema.
 */
export interface AccentedHeadline {
  headline: string;
  accentWord?: string;
}

/**
 * Move the first `**word**` out of the headline and into `accentWord`.
 *
 * Only the first pair is honoured: the design allows exactly one accent per headline. An
 * `accentWord` the model set for itself is left alone — that is a real choice, and the
 * markers are stripped either way so nothing prints.
 */
export function hoistAccentMarkdown(headline: string, accentWord?: string): AccentedHeadline {
  if (typeof headline !== "string" || !headline.includes("**")) return { headline, accentWord };

  const m = headline.match(/\*\*([^*]+)\*\*/);
  if (!m) return { headline, accentWord };

  return {
    headline: headline.replace(/\*\*([^*]+)\*\*/g, "$1"),
    accentWord: accentWord?.trim() ? accentWord : m[1],
  };
}
