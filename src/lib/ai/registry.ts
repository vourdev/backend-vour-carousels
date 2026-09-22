import type { LanguageModel } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { omnirouteGate } from "../../services/omniroute-gate";

/** "gemini" and "vour-lite" are retired and kept only so stored records resolve — see resolveModel. */
export type ModelId = "gemini" | "deepseek" | "mimo" | "openrouter" | "omniroute" | "vour-high" | "vour-lite";

function has(env: NodeJS.ProcessEnv, ...keys: string[]): boolean {
  return keys.every((k) => Boolean(env[k]));
}

/** OmniRoute only — combos already fall back across models internally, so no other provider should be selectable. */
export function availableModels(env: NodeJS.ProcessEnv = process.env): ModelId[] {
  const out: ModelId[] = [];

  // One combo, `vour-combos`.
  //
  // `vour-lite` used to be offered here too, mapping to a `vour-learning` combo that does not
  // exist in the OmniRoute catalogue — so every call that selected it died with
  // `400 Unable to determine provider for model 'vour-learning'`. Advertising it on the
  // presence of two env vars, rather than on the combo existing, is what hid that: the model
  // picker listed it, `verify-identity` asked for it, and both only found out at call time.
  if (has(env, "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL")) {
    out.push("vour-high");   // Maps to vour-combos
  }
  
  // Legacy omniroute support
  if (
    has(env, "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL") &&
    (Boolean(env.OMNIROUTE_COMBO) || Boolean(env.OMNIROUTE_MODEL))
  ) {
    out.push("omniroute");
  }
  return out;
}

export function defaultModel(env: NodeJS.ProcessEnv = process.env): ModelId | null {
  return availableModels(env)[0] ?? null;
}

function cleanBaseUrl(url: string | undefined): string {
  if (!url) return "";
  let cleaned = url.trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) {
    cleaned = cleaned.substring(0, cleaned.length - "/chat/completions".length);
  }
  if (!cleaned.endsWith("/v1") && !cleaned.includes("/v1/")) {
    cleaned = `${cleaned}/v1`;
  }
  return cleaned;
}

/**
 * Every OmniRoute request, funnelled through `omnirouteGate`.
 *
 * The gate is here rather than around `generateBrief`/`generateSlidePlan` because the AI
 * SDK's own transport retries never surface at that level, and they are part of the load
 * OmniRoute sees. Wrapping `fetch` also means a caller cannot opt out by accident: the
 * topic generator and the research agent get the same spacing without importing anything.
 */
async function omnirouteFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return omnirouteGate.run(() => omnirouteRequest(input, init));
}

async function omnirouteRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const rawText = await response.text();
    const lines = rawText.split("\n");
    let fullContent = "";
    let lastId = "chatcmpl-omniroute";
    let modelName = "omniroute";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:") && !trimmed.includes("[DONE]")) {
        const jsonStr = trimmed.substring(5).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.id) lastId = parsed.id;
          if (parsed.model) modelName = parsed.model;
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (deltaContent) {
            fullContent += deltaContent;
          }
        } catch {
          // ignore invalid chunk
        }
      }
    }

    const jsonCompletion = {
      id: lastId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullContent,
          },
          finish_reason: "stop",
        },
      ],
    };

    return new Response(JSON.stringify(jsonCompletion), {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  return response;
}

/**
 * An arbitrary OmniRoute model by its catalogue id.
 *
 * `resolveModel` only knows the fixed combos this app routes normal work through. News
 * discovery needs one specific model outside that set — a browser-transport one that can
 * actually search the web (`gemini-web/*`) — and pinning it to a `ModelId` would imply it is
 * interchangeable with the combos, which it is not: it is slow, cookie-authenticated, and
 * used for one job. Same gate and same key as everything else.
 */
export function resolveOmnirouteModelById(modelId: string): LanguageModel | null {
  const env = process.env;
  if (!has(env, "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL")) return null;
  const client = createOpenAICompatible({
    name: "omniroute-direct",
    apiKey: env.OMNIROUTE_API_KEY,
    baseURL: cleanBaseUrl(env.OMNIROUTE_BASE_URL),
    fetch: omnirouteFetch,
  });
  return client(modelId);
}

export function resolveModel(id: ModelId): LanguageModel {
  const env = process.env;
  switch (id) {
    case "gemini": {
      // Gemini is no longer reachable from this service: the provider SDK is gone and the
      // key with it. The id survives only because saved carousels and drafts store it, and
      // opening one must not throw — so it resolves to the default combo instead, which is
      // what a stored record would be regenerated with today.
      console.warn('[registry] modelId "gemini" is retired — using vour-high instead.');
      return resolveModel("vour-high");
    }
    case "deepseek": {
      const deepseek = createDeepSeek({
        apiKey: env.DEEPSEEK_API_KEY,
      });
      return deepseek("deepseek-chat");
    }
    case "mimo": {
      const mimo = createOpenAICompatible({
        name: "mimo",
        apiKey: env.MIMO_API_KEY,
        baseURL: cleanBaseUrl(env.MIMO_BASE_URL),
      });
      return mimo(env.MIMO_MODEL as string);
    }
    case "openrouter": {
      const openrouter = createOpenAICompatible({
        name: "openrouter",
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://github.com/vourdev/vour-carousels",
          "X-OpenRouter-Title": "Vour Carousels Studio",
        },
      });
      return openrouter(env.OPENROUTER_MODEL || "tencent/hy3:free");
    }
    case "vour-high": {
      // vour-high = vour-combos (high quality combo)
      const vourHigh = createOpenAICompatible({
        name: "vour-high",
        apiKey: env.OMNIROUTE_API_KEY,
        baseURL: cleanBaseUrl(env.OMNIROUTE_BASE_URL),
        fetch: omnirouteFetch,
      });
      return vourHigh("vour-combos");
    }
    case "vour-lite": {
      // Retired with the `vour-learning` combo it pointed at, which was removed from
      // OmniRoute on 22 Sep 2026. The id survives because saved carousels and drafts store
      // it, and opening one must not throw — so it resolves to the combo those records would
      // be regenerated with today.
      console.warn('[registry] modelId "vour-lite" is retired — using vour-high instead.');
      return resolveModel("vour-high");
    }
    case "omniroute": {
      const omniroute = createOpenAICompatible({
        name: "omniroute",
        apiKey: env.OMNIROUTE_API_KEY,
        baseURL: cleanBaseUrl(env.OMNIROUTE_BASE_URL),
        fetch: omnirouteFetch,
      });
      const target = (env.OMNIROUTE_COMBO || env.OMNIROUTE_MODEL) as string;
      return omniroute(target);
    }
  }
}

/**
 * Providers whose upstream rejects `responseFormat`, so `generateObject` can
 * never succeed against them.
 *
 * Everything routed through omniroute lands on a combo that does not implement
 * structured outputs. The SDK says so plainly at runtime —
 * `AI SDK Warning (vour-high.chat / vour-combos): The feature "responseFormat"
 * is not supported` — and the call then fails with "No object generated: could
 * not parse the response", every single time.
 *
 * The text path that follows works fine, so nothing looked broken: the plan was
 * still produced, just after paying for one full model call that had no chance
 * of succeeding. On a healthy link that is a doubling nobody notices. On a link
 * dropping half its packets it is the difference between answering and being cut
 * off at Cloudflare's 100s ceiling with a bare 524.
 */
/**
 * Options every model call spreads in. Currently one thing: how many times the AI SDK's
 * transport may retry on its own.
 *
 * The SDK defaults to 2 retries, so one "buat brief" click is up to THREE requests as far
 * as OmniRoute is concerned, and its logs show exactly that. Against an upstream that is
 * merely slow, retrying is right. Against OmniRoute it is actively harmful: a request that
 * fails there has usually sat in its queue until the budget ran out
 * (`Request dropped after exceeding the local rate-limit queue budget maxWaitMs (120000ms)`),
 * and the retry immediately books another 120-second slot in the queue that just proved to
 * be full. Three of those is six minutes spent making the saturation worse.
 *
 * So the transport gets zero retries and `withRetry` in lib/ai/generate.ts is the only
 * retry authority: three attempts, real backoff between them, and every attempt passes
 * through the concurrency gate. One layer, spaced, visible in the logs.
 *
 * `OMNIROUTE_SDK_RETRIES` raises it again without a deploy if a link ever needs it.
 */
export function aiCallDefaults(): { maxRetries: number } {
  const raw = process.env.OMNIROUTE_SDK_RETRIES;
  const n = raw ? parseInt(raw, 10) : NaN;
  return { maxRetries: Number.isFinite(n) && n >= 0 ? n : 0 };
}

const NO_STRUCTURED_OUTPUT_PROVIDERS = ["vour-high", "vour-lite", "omniroute"];

export function supportsStructuredOutput(model: LanguageModel): boolean {
  const provider =
    typeof model === "string" ? model : String((model as { provider?: string })?.provider ?? "");
  return !NO_STRUCTURED_OUTPUT_PROVIDERS.some((p) => provider.startsWith(p));
}
