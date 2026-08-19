/**
 * The one place a carousel's caption and hashtags become the text that gets posted.
 *
 * This existed three times before — the automation cron, the interactive publish
 * route, and the web app's own calendar action — and they had already drifted: the
 * web copy posted the caption alone and dropped the hashtags entirely, so posts
 * scheduled from the calendar reached Instagram with no tags at all. Anything that
 * publishes goes through here now.
 */
export function buildPostText(caption: string, hashtags: string[]): string {
  const tags = (hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  const body = (caption ?? "").trim();
  if (!body) return tags;
  if (!tags) return body;
  return `${body}\n\n${tags}`;
}
