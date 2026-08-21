# backend-vour-carousels

Generates Instagram/TikTok carousel decks for **@vourdev** — an Indonesian backend-engineering
education brand — and schedules them to Buffer. A deck goes: idea → Markdown brief → structured
slide plan → HTML → PNG/JPEG screenshots → Cloudinary → Buffer.

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
POST /api/publish/upload          base64 -> Cloudinary URL
POST /api/publish/schedule        explicit plan + urls -> Buffer
POST /api/publish/carousel        saved carousel id -> Buffer (builds text server-side)
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

**TikTok caps photo posts at 2,073,600 px.** Slides capture at 1080×1350 with
`deviceScaleFactor: 2` = 5.8M px, which Buffer rejects for TikTok only. `toTikTokSafeUrl()`
inserts a Cloudinary `c_limit,w_1280,h_1600` transform on the way out. Instagram keeps the
full-resolution asset.

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

**Slide `layout` absent means "renderer decides", not "standard".** The field used to carry
`.default("standard")`, which stamped an explicit value on every point slide at parse time —
the renderer could no longer tell a real choice from an omission, so every deck came out in
one composition. `resolveLayout` in `render-slide.ts` rotates one in, and degrades
`note-emphasis` to `standard` on the 20 of 32 types that cannot emit a `.catatan`, and
`split-content` for any mockup too wide for a 435px column. Do not reintroduce the default.

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
    publish/             cloudinary · buffer · caption · schedule
    topics/              the topic bank (bank/service/generator/schedule)
    history/repo.ts      saved carousels
    memory/repo.ts       revision history per draft
  services/capture-queue.ts   one shared Chromium, bounded concurrency
```

**Models: OmniRoute only.** `availableModels()` deliberately returns nothing for Gemini,
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
