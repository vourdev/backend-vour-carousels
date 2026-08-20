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
```

Copy `.env.example` to `.env` first. The service will not start without `DATABASE_URL` +
`DATABASE_AUTH_TOKEN` (Turso), and refuses to do anything useful without `OMNIROUTE_API_KEY`.

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
GET/POST/PATCH/DELETE /api/topics
POST /api/topics/generate · /api/topics/:id/brief

# port 3001 — X-API-Key
GET  /automation/topic/next       claim one "idea" topic, flip to "queued"
POST /automation/generate         full pipeline: 2 decks, captured, scheduled
POST /automation/topics/generate  refill the bank
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
    ds/                  the design system: schema, renderer, 29 mockup templates
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
