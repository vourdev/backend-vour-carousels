# backend-vour-carousels

Generates Instagram/TikTok carousel decks for **@vourdev** — an Indonesian backend-engineering
education brand — and schedules them to Buffer. A deck goes: idea → Markdown brief → structured
slide plan → HTML → PNG/JPEG screenshots → local slide store → Buffer.

This service owns **all** of that. The Next.js frontend (`vour-carousels`, deployed on Vercel)
is a display layer that proxies here; it holds no prompts, no model config, and no publishing
code. If you are about to add generation or publishing logic to the frontend, that is the bug —
it used to have a duplicate copy and the two drifted, which is why the split exists.

## Running it

```bash
npm run dev      # tsx watch, both servers
npm test         # vitest, ~300 tests
npm run build    # esbuild bundle -> dist/server.js
npm run seed     # create the one operator account (see below)
npm run check:evidence   # live: real capture, consent wall, blank page, 404
```

Copy `.env.example` to `.env` first. The service will not start without `DATABASE_URL` +
`DATABASE_AUTH_TOKEN` (Turso), and refuses to do anything useful without `OMNIROUTE_API_KEY`.

**A fresh database needs `npm run seed` before anything works.** Public signup is off at
runtime (`disableSignUp` in `lib/auth.ts`) and `/automation/generate` refuses to run without
a user row, so a clean deploy answers "No user found in the database. Seed the database
first." with nothing to run. `scripts/seed-user.ts` is that: it applies better-auth's own
schema via `getMigrations` (better-auth does not create its tables, and the CLI is not a
dependency here), flips `ALLOW_SIGNUP` on for its own process only, and creates one account.
It refuses to touch a database that already has users, so re-running is safe.

```bash
npm run seed -- --email you@example.com --password 'at-least-8-chars'
```

## Two servers, one process

`src/server.ts` starts two Hono apps on two ports. This is a security boundary, not a
convenience — do not merge them.

| | Port 3000 (`userApp`) | Port 3001 (`automationApp`) |
|---|---|---|
| Auth | better-auth session cookie (`authMiddleware`) | `X-API-Key` header (`apiKeyMiddleware`) |
| Prefix | `/api/*` | `/automation/*` |
| Caller | the Vercel frontend, as a logged-in user | n8n, machine-to-machine |
| Exposure | public via `api-automation.vour.dev` | **internal only** — Docker Swarm overlay network |

Port 3001 is deliberately not routed by Traefik. n8n reaches it by Swarm service name
(`http://vour-backend-carousels-generator-2usphl:3001`). A 404 for `/automation/*` from the
public domain is correct behaviour; if it ever answers, something is misconfigured.

### Routes

```
GET  /health                      both ports, unauthenticated

# port 3000 — session
GET  /api/models                  ids the configured keys allow
GET  /api/publish/config          which Buffer channels exist
POST /api/brief · /polish · /revise
POST /api/plan · /revise
POST /api/assemble                slide plan -> standalone HTML
POST /api/capture                 HTML -> base64 images (Playwright)
POST /api/publish/upload          base64 -> cdn.vour.dev URL
POST /api/publish/schedule        explicit plan + urls -> Buffer
POST /api/publish/carousel        saved carousel id -> Buffer (builds text server-side)
POST /api/evidence/upload         human upload for a screenshot auto-capture missed
GET  /api/plan/mockup-stats       mockup-type usage for the signed-in user
GET/POST/PATCH/DELETE /api/topics
POST /api/topics/generate · /api/topics/:id/brief
POST /api/topics/generate-from-notes   raw notes -> topic candidates ("idea")
GET  /api/products                active products, for the topic UI

# port 3001 — X-API-Key
GET  /automation/topic/next       claim one "idea" topic, flip to "queued"
POST /automation/generate         full pipeline: 2 decks, captured, scheduled
POST /automation/topics/generate  refill the bank
POST /automation/research-topics  raw notes -> candidates, saved "pending_review"
PATCH /automation/research-topics/:id/status   approve/reject a candidate
```

## The daily automation

n8n workflow `boGfcsl5T5w6H6l0` ("Vour Carousel Auto-Generator"), cron `0 0 * * *`, workflow
timezone `Asia/Jakarta`:

1. `GET /automation/topic/next` — takes one `idea` topic, marks it `queued` so a retrigger
   cannot hand out the same topic twice.
2. `POST /automation/generate` with `{topic, topicId}` — generates **two** decks from that one
   topic (different angles: practical guide / common mistakes), captures both, uploads both,
   schedules both to Instagram *and* TikTok, then marks the topic `published`.

Posts are scheduled for **12:00 and 12:30 WIB**. Send `topicId` or the topic is never closed
out and the bank fills with `queued` rows that were in fact already posted.

## Things that will bite you

**`npm start` does not read `.env`.** It is `node dist/server.js` with no `--env-file`, and
nothing in `src/` imports dotenv — production gets its environment from the swarm service, not
from a file. Run it locally and `DATABASE_URL` is undefined, `dbConfig()` falls back to an empty
`file:local-auth.db`, and every request answers `Unauthorized: Invalid or missing session`
because the session row lives in Turso. The symptom looks exactly like a broken cookie or a
secret mismatch, and it is neither. Use `npm run dev` (which passes
`--env-file-if-exists=.env`), or `node --env-file=.env dist/server.js` when you specifically
need the bundle.

**`dist/` is tracked, so it can be committed stale.** A commit that changes `src/` does not
rebuild the bundle. It has already shipped once with the source of a feature and a bundle from
before it, which means a clean checkout running `npm start` served the *old* server while the
diff said otherwise. Run `npm run build` before committing anything under `src/`, and verify by
grepping the bundle for a symbol only the new code has.

**OmniRoute does not support structured output.** `generateObject` fails on every plan call —
`No object generated: could not parse the response`. The `generateText` + `extractAndParseJson`
+ `repairSlidePlan` fallback in `lib/ai/generate.ts` is therefore the **primary** production
path, not an emergency one. Anything you change in `lib/ds/repair.ts` runs on every single
generation. Test it accordingly.

**`slidePlanSchema` is a publishing contract, not a formality.** `title`, `caption` and
`hashtags` are posted verbatim to Instagram and TikTok, so they are non-empty and
length-capped (≤90 / ≤2200 / exactly 5 tags). They were unconstrained once, models omitted
them, and blank posts shipped. If you loosen these, blank posts ship again. `repairSlidePlan`
must keep deriving real values rather than defaulting to `""`/`[]` — with a strict schema,
empty defaults turn the salvage path into a second way to lose the deck.

**Prompt text and schema must agree.** Caps and shapes are single-sourced in
`lib/ai/prompts.ts` as `TITLE_CAPTION_RULE` and `HASHTAG_RULE`, referenced from the brief, plan
and scoped-revision prompts. Change the schema, change the rule, or the model gets rejected for
a limit nobody told it about.

**Slides are served from this box, not Cloudinary.** Measured 25 Aug 2026, this VPS's uplink
loses 12-60% of outbound packets: pushing a 1.8 MB deck to Cloudinary took **85.9s** and logged
six `499 Request Timeout` retries, all of it blocking the generation response. `publish/
local-store.ts` writes each slide to `SLIDE_STORE_DIR` instead, named `<sha256>.jpg`, and nginx
serves it at `PUBLIC_SLIDE_BASE` (`cdn.vour.dev/slides`) behind Cloudflare. The bytes still
reach Instagram, but as a *pull* Cloudflare caches once — same 300 KB payload that day: 0.54s
cold, 0.24s warm.

Two consequences worth knowing before touching it. The file name is the hash of the contents,
so a URL can never mean different bytes — that is what lets nginx promise `immutable` for a
year, and why a re-export of an unchanged deck rewrites nothing. And rows written before that
date still hold Cloudinary URLs: `publish/assets.ts` routes a delete to whichever store owns
the URL, so `cloudinary.ts` survives as delete-only. Never write to it again.

**TikTok caps photo posts at 2,073,600 px.** Slides now capture at 1080×1350 with
`deviceScaleFactor: 1` = 1.46M px, under the cap, so one asset serves both platforms.
`lib/export/slide-format.ts` is the only place that decides this. It used to be
`deviceScaleFactor: 2` = 5.8M px, which Buffer rejected for TikTok and Instagram downsampled
anyway; `toTikTokSafeUrl()` remains only to fix up the legacy Cloudinary URLs from then.

**Never build post text by hand.** `buildPostText(caption, hashtags)` is the only place caption
and hashtags become the posted string. It existed in three copies before and they drifted — one
posted the caption with every hashtag dropped.

**Timezone.** The container runs UTC. `new Date(y, m, d, 12, 0)` means noon *UTC*, which is
19:00 in Jakarta — this shipped, and posts went out at seven in the evening. Use
`nextWibSlot()` in `lib/publish/schedule.ts`; it does the arithmetic in WIB (fixed UTC+7, no
DST) and does not depend on the host clock.

**Playwright version is pinned to the base image.** The Dockerfile is
`mcr.microsoft.com/playwright:v1.62.1-jammy` and must match whatever `package-lock.json`
resolves `playwright` to, exactly. A mismatch fails at runtime with `Executable doesn't exist`
— the error names the tag you need.

**esbuild bundles to ESM, and some deps still `require()`.** The build script injects a
`createRequire` banner. Removing it reintroduces `Dynamic require of "path" is not supported`
at boot.

**better-auth throws in production without `BETTER_AUTH_SECRET`.** In development it only
warns, so this fails on deploy and nowhere else. `BETTER_AUTH_URL` is needed too.

**A mockup type is reachable only from the CATEGORY table, not from the catalogue.**
`MOCKUP_VARIETY_RULE` in `lib/ai/prompts.ts` tells the model to classify the slide and then
pick from that category's list. A type documented in the numbered catalogue but absent from
the table is one a compliant model can never choose. Nine of them sat that way — the six
backend types added in `9901a26` among them — which is the real reason the decks looked
monotone. Add a type in four places or not at all: `schema.ts`, the catalogue, the CATEGORY
table, and `ALL_MOCKUP_TYPES` in `history/repo.ts` (that last one is what tracks it).

**`getUnderusedMockupTypes` returns `[]` when it has no evidence, and that is deliberate.**
Every carousel written before the INSERT fix in `da88b89` stored a NULL `slide_plan`, so the
stats came back `{}`, every type tied at zero, the sort was a no-op, and the function returned
the first ten entries of `ALL_MOCKUP_TYPES` in array order — which are the *most* used types.
The prompt presents that list as "UNDERUSED, prioritize these". The diversity feature was
driving the monoculture. `screenshot`/`custom`/`browser` are also excluded permanently: they
are rare by design, so they sit at the bottom of any ranking forever.

**A `flow` is three nodes on one row, and the schema silently enforces it.** `.diag-flow`
used to be `flex-wrap: wrap`, so a fourth step landed on a second row carrying its own
arrow — which reads as the chain *forking*. Every flow slide in the carousels history came
back with exactly four steps, all of them linear, so the branch existed only in the
rendering. `compressFlowSteps` in `ds/schema.ts` folds anything longer to first · pivot ·
last (pivot = the step marked `focus`), by `.transform()` rather than `.max()` for the same
reason as `mockupConcept` — a fifth step should cost the model its fourth node, not the
whole deck. Two consequences: a step CAN disappear between the model's output and the
render, and the row must never wrap again, which is why `.diag-flow` is `nowrap` with
`min-width: 0` on the items so long labels shrink instead. Linearity itself needs no check:
`steps` is a flat array, so a branch cannot be expressed.

**A note spans the slide, never a column.** `section.slide-point > .catatan` carries
`grid-column: 1 / -1` alongside its `order`, so full width is the default for any grid
composition instead of something each one has to remember. `split-content` placed it in
column 2 and the note rendered at 435px of the 920px content box — 47% — beside a mockup
that was already narrow. It sits in row 5 there now, under both columns. The child
combinator is load-bearing: `comparison` and `illustration` nest their own `.catatan`, and
those belong to their mockup's layout.

**Slide `layout` absent means "renderer decides", not "standard".** The field used to carry
`.default("standard")`, which stamped an explicit value on every point slide at parse time —
the renderer could no longer tell a real choice from an omission, so every deck came out in
one composition. `resolveLayout` in `render-slide.ts` rotates one in, and degrades
`note-emphasis` to `standard` on the 20 of 32 types that cannot emit a `.catatan`, and
`split-content` for any mockup too wide for a 435px column. Do not reintroduce the default.

**The headline is the hook, and CSS is the only thing keeping it near the top.** Eyebrow +
headline must land inside the first two blocks a reader sees, in every composition. That is
enforced by the reading-order slots in `carousel-css-extra.ts` — `section.slide-point > *`,
numbered in tens — not by DOM order, which the compositions reshuffle. Two rules follow:
`.catatan` is pinned to the last slot on every layout (`note-emphasis` means the note is
drawn *bigger*, never moved earlier), and slot 20 is the only slot ahead of the hook, taken
only by `.diag-wrap`/`.card`, which are mutually exclusive at render time. A composition
override must name both classes (`section.slide-point.layout-x > …`) or it ties with the
slot rule and loses on source order — the layout then silently renders as `standard`.
`npm test` checks the authored CSS; `npm run check:layout` measures real geometry in a
browser across every note-bearing mockup × every composition, which is the only thing that
catches a specificity or grid-placement mistake. This shipped broken twice with the markup
correct both times.

**A mockup list in the prompt is read from the renderer, never typed out.** `LAYOUT_RULE`
in `lib/ai/prompts.ts` interpolates `NARROW_SAFE_MOCKUPS` and `NOTE_BEARING_MOCKUPS` from
`render-slide.ts`. The hand-written copy had drifted to recommending `split-content` for
five types `resolveLayout` degrades on sight, so the model followed the prompt and the deck
came out monotone anyway. Same rule as `TITLE_CAPTION_RULE`: if the renderer decides it,
the prompt reads it.

**The cron path strips `screenshot` mockups.** With no image uploaded they render a
"BUTUH SCREENSHOT ASLI" placeholder — a brief addressed to a human. In the wizard that is the
feature; in the unattended cron it would be captured, uploaded and scheduled to Instagram as
finished artwork. `stripUnfulfillableEvidence()` runs on the automation path only.

**`/automation/generate` can answer `success: true, partial: true`.** The two decks reach
Buffer independently, so one can be live when the other throws. It used `Promise.all`, which
discarded the winner and returned 500 while its post stayed scheduled — n8n read the 500,
retried, and the topic went out three times. It now closes the topic to `published` if
anything shipped, and returns it to `idea` if nothing did; leaving it `queued` made the row
invisible to every query and drained the bank by one topic per failed run.

**Only one browser in this service may reach the internet, and it is not the one that
exports decks.** `captureCarousel` / `captureCarouselServer` / `captureQueue` render the
finished carousel from an HTML string with every asset already inlined, and they stay
offline — an export that depends on a third party being up is an export that fails at
midnight in the cron. `lib/evidence/capture-web.ts` is the exception, launches its own
Chromium, and is used for nothing but photographing external pages.
`test/evidence/offline-isolation.test.ts` is the fence: it fails if an offline module
grows a `.goto(`, or if the evidence path imports `capture-queue`.

**A screenshot URL is never the model's to invent, and there is no search to ask.** There
was: a Gemini grounded search, with the rule "the host the model names must also appear in
the sources that came back with it". Gemini is gone from this service and the only
search-capable model in the OmniRoute catalogue (`tllm/sonar-pro`) answers 403
insufficient_quota, so `proposeOfficialUrls` returns UNVERIFIED CANDIDATES from a model's
memory — measurably unreliable: asked about OpenCode, the combo offers `opencode.dev`
(does not resolve) before `opencode.ai` (the real site).

`verifyPageIdentity` is what makes that safe, and it is the gate the security of this
feature now rests on. Every candidate is opened and its own `<title>`, meta description,
og:site_name and `<h1>` are scored against the entity's distinctive words before ONE pixel
is captured. Clear yes and clear no are decided on token overlap for free; only genuinely
ambiguous pages spend a small model call, and a page with zero overlap is rejected without
one. It fails closed everywhere: unreachable host, judge unavailable, partial match with
no judge — all "no screenshot".

That is also why confidence no longer vetoes a candidate, only orders the queue. A wrong
guess costs one page load and is thrown away by the gate; dropping it costs the slide its
screenshot, and the right domain is often the model's second guess.

**Auto-captured evidence replaces human approval with `lib/evidence/validate.ts`.**
Nothing looks at the picture before it is posted, so a shot is kept only if it is bigger
than 25 KB, less than 85% near-white, less than 92% one flat colour, and holds at least 4
colour buckets. Those catch what actually happens unattended: a 404, an unpainted page, a
consent wall that would not dismiss, a login screen. Loosen them and the failure mode is a
blank rectangle scheduled to Instagram as proof of something. Every attempt — kept or
dropped — is written to `web_evidence_log`; `evidenceFailureStats()` answers "which sites
keep failing".

**`fulfillWebEvidence` fills evidence in; it never chooses the fallback.** A slide it
cannot satisfy is returned exactly as it arrived, still `pending`, and each path applies
the policy it already had: `stripUnfulfillableEvidence` swaps in an illustration on the
cron, and the wizard keeps the "BUTUH SCREENSHOT ASLI" card, where a human being present
is the whole point. Both call the one function — the split is in what happens after it,
not in what it does.

**A human-uploaded screenshot is shaped by `/api/evidence/upload`, never by the browser.**
`/api/plan` returns `evidence: attempts[]`, each carrying the `slideIndex` it belongs to
and why it failed — that is what tells the wizard which slides need the upload form.
The file comes back here as a data URL and `normalizeUploadedEvidence` crops it to the
brief's ratio (top-anchored: a screenshot's evidence is at the top), caps it at 2048px and
re-encodes to JPEG, so an uploaded slide holds the same kind of value as an auto-captured
one — a 12 MB monitor grab otherwise travels intact through capture, Cloudinary and Buffer
to be drawn 480px tall. The wizard had its own copy of this and it had already drifted:
centre-anchored, 1080px, quality 0.8, so which crop a slide got depended on which path
filled it. Only the image crosses the wire; the plan stays in the wizard with every other
edit. The blank/flat thresholds only WARN here — a person looked at this picture and chose
it, which is the approval the automatic path does not have.

**`dist/` is committed but never shipped.** It is in `.dockerignore`, so the image builds from
source (`npm ci` → `npm run build`) and a stale committed bundle can never reach production.
Do not "fix" the Dockerfile by adding `COPY dist` — that reintroduces the bug this avoids. The
checked-in copy is only local build output; treat a diff in it as noise, not a change.

## Layout

```
src/
  server.ts              both apps, middleware wiring, CORS
  middleware/            auth.ts (session) · api-key.ts (X-API-Key)
  routes/
    user/                session-authenticated, port 3000
    automation/          API-key, port 3001
  lib/
    ai/
      registry.ts        ModelId -> LanguageModel. OmniRoute only (see below)
      prompts.ts         every system prompt; single-sourced rules live at the top
      generate.ts        brief/plan/revision calls + withRetry
      revision-scope.ts  works out what a revision targets, merges it back, proves
                         nothing else moved
      brief-sections.ts  same idea, for Markdown briefs
    ds/                  the design system: schema, renderer, 32 mockup templates
      schema.ts          zod contract for a slide plan — the source of truth
      repair.ts          salvages recoverable model slop (runs on every generation)
      assemble.ts        slide plan -> standalone HTML
    evidence/            automatic screenshot evidence: resolve-url · verify-identity ·
                         capture-web · validate · fulfill · log · normalize
                         (the only networked browser in the service)
    publish/             local-store · assets · buffer · caption · schedule
                         (cloudinary.ts is delete-only, for pre-25-Aug-2026 rows)
    topics/              the topic bank (bank/service/generator/schedule)
    history/repo.ts      saved carousels
    memory/repo.ts       revision history per draft
  services/capture-queue.ts   one shared Chromium, bounded concurrency
```

**Models: OmniRoute only, and Gemini is gone entirely.** The `@ai-sdk/google` dependency
is removed, `resolveModel("gemini")` resolves to `vour-lite` and warns — the id survives
only so a saved carousel that stores it still opens. The live trend-research pass in
`lib/topics/generator.ts` went with it: it was the one real web search here, and
reimplementing it on a plain OmniRoute model would return the model's memory while calling
itself research, so `research: true` is now accepted, logged and ignored.
`availableModels()` deliberately returns nothing for Gemini,
DeepSeek, MiMo or OpenRouter even when their keys are set. OmniRoute combos already fall back
across models internally; a second provider here is a fallback around a fallback, and in
practice a stray `GOOGLE_GENERATIVE_AI_API_KEY` outranked OmniRoute and took the default with
no fallback at all. `resolveModel()` still handles the other ids for backward compatibility
with stored records — that is not an invitation to re-enable them.

**Chromium is shared and long-lived.** `captureQueue` keeps one browser, capped at
`MAX_CONCURRENT_CAPTURES` (default 2), and relaunches if it dies — `isConnected()` is checked
before reuse and the handle is cleared on `disconnected`. Without that guard a single crash
broke every capture until restart.

## Deploying

Dokploy on the VPS, app **"Backend Carousels Generator"**, Docker build, auto-deploy from a
GitHub App webhook on push to `main`. Check a deploy landed:

```sql
SELECT d.status, d.title FROM deployment d
JOIN application a ON a."applicationId" = d."applicationId"
WHERE a.name = 'Backend Carousels Generator'
ORDER BY d."createdAt" DESC LIMIT 1;
```

(run inside the `dokploy-postgres` container). If pushes stop producing deployments with no log
line anywhere, suspect the GitHub side rather than this repo — a GitHub account rename silently
broke webhook delivery once, and reverting the rename fixed it.
