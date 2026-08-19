# Illustration allowlist — why these categories

`illustrations.manifest.json` is JSON (no comments allowed), so the audit trail lives here.

## How the slugs were picked

1. **Topic analysis first.** Categories were derived from what has actually been produced,
   not from generic taxonomy: 61 rows in the `carousels` history table (≈25 unique titles)
   plus 19 rows in the `topics` bank on the production Turso DB, cross-checked against the
   8 exported decks in `carousels/` and the category list in `lib/topics/schema.ts`.
2. **Verified, never guessed.** Every candidate came from the unDraw search API
   (`GET https://undraw.co/api/search?q=<term>` → `{ results: [{ title, newSlug, media }], total, hasMore, page }`),
   then each slug was individually fetched from `https://cdn.undraw.co/illustrations/<slug>.svg`
   and confirmed to return 200 with `<svg` in the body. 1114 candidates were verified;
   145 were kept. unDraw slugs carry a content hash suffix (`_9eix`), so a slug can never
   be inferred from a title — it must come from the API.
3. **Silent-failure guard.** `scripts/gen-illustrations.mjs` skips a slug it cannot fetch and
   only logs a warning, so a bad slug rots quietly. `test/ds/illustrations.test.ts` now asserts
   every manifest slug exists in `illustrations.generated.ts`, which turns that into a test failure.

## Categories

| Category | Why it exists (evidence from history) |
| --- | --- |
| `database` | Largest recurring theme: "Index Database Nggak Selalu Bikin Query Cepat", "N+1 Query", "SQL vs NoSQL", "5 Kesalahan Prisma ORM", "Query Lambat". |
| `infrastructure` | Unexpectedly heavy in history and absent from the old manifest: "On-Prem vs Cloud (AWS/GCP)", "Firecracker MicroVM", "Subnet IP Private /24 /29 /30", "IP Public vs Private", "Tembaga atau Fiber", "Router Ruijie", "Docker Itu Wajib?". |
| `security` | "JWT Itu Bukan Enkripsi" (published twice), "Bcrypt untuk Hashing Password", "Arsitektur Auth: Session, JWT & OAuth", "Env Secrets Management", "Server Actions Vulnerable". |
| `api_integration` | "REST vs GraphQL", "Rate Limiting: 4 Kesalahan", "Idempotency di API", "Webhook", "5 Kesalahan Message Queue". Message/notification/transfer imagery maps to request-response and queue analogies. |
| `ai_tools` | Brand's north star (`lib/topics/generator.ts` → ai-workflow is a first-class category): "MCP Server di Claude Desktop", "Masalah Context Window", "RAG vs Fine-Tuning", "LangChain + PostgreSQL", "n8n + OpenAI", "Vector Cache". |
| `code_craft` | Recurring dev-craft framing: "GitHub vs GitLab", "TypeScript Generics", "Server Actions", code review / version control / open source analogies. |
| `mistakes` | `common-mistakes` is a standing topic category and a weekly slot (Wed) in `WEEK_RHYTHM`: "7 Kesalahan Junior Frontend", "5 Kesalahan Message Queue", "5 Kesalahan Prisma". |
| `performance` | Distinct from `mistakes` — the "kenapa lemot" angle: "Query Lambat", "Bikin Web Lemot", "N+1 Bikin API Lemot", "Rahasia Cepatnya AWS Lambda". |
| `comparison` | A recurring *format*, not just a topic: "X vs Y" appears in at least 6 published decks (REST/GraphQL, Next.js/Laravel, GitHub/GitLab, On-Prem/Cloud, SQL/NoSQL, Tembaga/Fiber). Slides need "choose between options" imagery. |
| `productivity` | `productivity` topic category + Friday tools slot: "VS Code Tuning", "Oh My Zsh + Starship", "3 Extension VS Code AI". |
| `automation` | `automation` topic category: "GitHub Actions Release Notes", cron/crontab deck, "Telegram Bot + Webhook", n8n workflows. Kept small — scheduling/task imagery only. |
| `learning` | Core audience framing (junior/mid devs, "senior-dev-to-junior" tone) and the tutorial/deep-dive slots. Carried over from v1. |
| `growth` | Metrics/analytics imagery for before-after and result slides. Carried over from v1. |
| `collaboration` | Carried over from v1, unchanged size. History shows little pure team content, so it was **not** expanded. |
| `communication` | Small: documentation and explain-to-non-technical angles ("Panduan", "Bedah Cara Kerja", myth-busting Sunday slot). |
| `career` | Deliberately the smallest (4). The audience is junior devs, but published decks are technical, not career advice — so this category is present without being over-weighted. |

## Deliberate omissions

- No pure soft-skill / HR / hiring expansion — the history has none.
- `surveillance_k6wl` (v1, `security`) was dropped as off-tone; every other v1 slug was kept.

## Where the SVGs live, and why they are not a TS module

The 145 SVGs total ~1.5 MB. They were originally emitted as one `illustrations.generated.ts`
holding inline string literals, which meant *any* importer of `render-slide.ts` dragged the
whole payload along. `app/create/wizard.tsx` is a client component and called
`assembleCarousel()` directly, so all 1.5 MB shipped to the browser — a verified 2.7 MB client
chunk out of 3.6 MB of total static JS.

The split now is:

| File | Reachable from | Payload |
| --- | --- | --- |
| `illustrations.manifest.json` | anywhere | ~4 KB |
| `illustrations.slugs.generated.ts` | anywhere | ~3.6 KB (slug union only) |
| `illustrations.ts` | anywhere — client-safe | vocabulary + `normalizeIllustration` |
| `illustrations.server.ts` | server only | reads `assets/illustrations/<slug>.<variant>.svg` via `fs.readFileSync`, memoized |
| `assets/illustrations/*.svg` | read at runtime, never imported | ~3.0 MB on disk (145 slugs × 2 variants) |

## Two surface variants, and why the model has no say

Slides render on two surfaces: **Ink** (`#1C0A05` rising to `#2B241D`, the deck
default) and **Paper** (warm cream `#FBF6EF`,
the explicit `surface: "paper"` opt-out). unDraw ships one palette built for white pages —
`#090814`, `#2f2e41`, `#3f3d56` carry the hair, clothes and outlines. On Ink those are
within a few points of the background, so the illustration dissolves. That is the whole
contrast bug.

CSS cannot fix it: `carousel-css-extra.ts` already documents the rule that a mockup must
never name a literal ink/paper colour, but an SVG `fill` is not a token and cannot be
re-scoped per surface. So the remap happens at codegen. Each slug is written twice:

- `<slug>.onLight.svg` — unDraw's value ordering kept, neutrals pulled onto the Vour ramp, accent `#EE4B1A` (VOUR_ORANGE)
- `<slug>.onDark.svg` — neutral ramp **inverted** (darkest becomes lightest), accent `#FF7A45` (VOUR_ORANGE_BRIGHT)

Skin tones (`#ed9da0`, `#ffb8b8`, `#a0616a` …) are deliberately left alone — they are
mid-tone and legible on both, and inverting them turns people green.

`render-slide.ts` picks the variant from `slide.surface`. The model's entire vocabulary is
`illustrationSlugs: string[]` (1–2 entries) plus an optional caption: no colour, size,
scale, position or variant field exists for it to set. A test asserts that stays true.

## Sizing

Illustrations are sized by **height**, not by a square box: 123 of the 145 are landscape
(median viewBox ratio 1.29, max 2.86). A `width:500px; height:500px` box letterboxes them —
a 2.86-ratio drawing becomes 240×84 of art in a 240×240 slot, which is what read as
"the illustration came out tiny". Pinning height and letting width follow the viewBox gives
every slug the same visual weight.

The height is a **ceiling, not a fixed value**. The slide is 1080×1350 with `padding:
96px 80px 80px`, so the content column is **920px** wide — but the vertical space left for
a mockup swings with the headline. Measured on the real canvas at 1080×1350:

| headline | `.diag-wrap` | single | pair (each) |
| --- | --- | --- | --- |
| 2 lines | 920×733 | 646×**500** | 446×**420** |
| 5 lines | 920×459 | 353×273 | 446×273 |

`align-self: stretch` gives `.diag-illustration` the wrap's full (flex-definite) height, the
group takes what the caption leaves, and `max-height: 100%` clamps the drawing to it. A fixed
height cannot satisfy both rows of that table: the previous fixed 440px looked right in the
roomy case and, in the tight one, pushed a 626px block through a 459px well — overlapping the
body text above it and running 4px past the bottom of the canvas.

Width caps: single 900px (a 2.86:1 panorama then keeps a 20px margin inside the column), pair
446px each, since two items plus the 28px gap must fit 920px. For a pair the width cap
usually binds before the height does — a 1.29:1 slug letterboxes to ~346px inside its 420px
box. Equal boxes across the pair are worth that.

The `node:fs` import in `illustrations.server.ts` is the guard: Next.js fails the build if a
client component reaches it. `render-slide.ts` → `assemble.ts` are therefore server-only, and
the wizard gets its preview HTML from `assembleAction` in `app/create/actions.ts`.

Nothing imports the SVGs, so they reach the serverless bundle only through file tracing.
Measured on a real `vercel build --target=preview`: all 145 appear in the `filePathMap` of
`create.func` (the function that hosts `/create` and its server actions), **with or without**
the `outputFileTracingIncludes` block in `next.config.ts` — the two builds' file maps are
identical at 909 entries each. `@vercel/nft` statically resolves the `readFileSync` call in
`illustrations.server.ts` and pulls in the whole directory by itself.

The config block is kept as a safety net, not as the thing that makes it work: that static
resolution only holds while `ASSETS_DIR` is built from literal path segments. If it ever
becomes dynamic, nft loses the trail and the illustrations silently degrade to the fallback.

## Regenerating

```bash
npm run gen:illustrations   # fetches each slug, recolors #6c63ff → the surface accent, writes one .svg per variant
npm test                    # fails if a manifest slug has no file on disk, or if the payload leaks client-side
```

`gen-illustrations.mjs` wipes `assets/illustrations/` before writing, so a slug removed from
the manifest also disappears from disk instead of lingering as a servable orphan.
