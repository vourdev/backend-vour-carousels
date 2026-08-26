import { describe, it, expect } from "vitest";
import {
  briefSystem,
  planSystem,
  scopedSlideReviseSystem,
  scopedGlobalReviseSystem,
} from "@/lib/ai/prompts";
import {
  VOICE_RULE,
  ADDRESS_RULE,
  SPEECH_TICS,
  STANCE_RULE,
  HUMOR_RULE,
  TEACHING_ORDER,
  DEPTH_RULE,
  ANALOGY_RULE,
  HONESTY_RULE,
} from "@/lib/ai/voice-profile";

/**
 * The bug this file exists to prevent has already happened once: voice-samples.ts
 * was imported by prompts.ts and referenced nowhere in it, so 300 lines of the
 * most concrete voice evidence in the repo never reached a single model call.
 * Nothing failed. The decks just quietly stopped sounding like their author.
 *
 * Every prompt that writes user-facing copy must therefore be asserted to CARRY
 * the rule, not merely to import it.
 */
describe("VOICE_RULE reaches every prompt that writes copy", () => {
  it("is carried by briefSystem", () => {
    expect(briefSystem).toContain(VOICE_RULE);
  });

  it("is carried by planSystem, where slide headlines are born", () => {
    expect(planSystem).toContain(VOICE_RULE);
  });

  it("is carried by the scoped slide revision prompt", () => {
    expect(scopedSlideReviseSystem).toContain(VOICE_RULE);
  });

  it("is carried by the scoped global revision prompt", () => {
    expect(scopedGlobalReviseSystem).toContain(VOICE_RULE);
  });
});

describe("the address the brand actually uses", () => {
  it("says gw and lu", () => {
    expect(ADDRESS_RULE).toMatch(/\bgw\b/);
    expect(ADDRESS_RULE).toMatch(/\blu\b/);
  });

  it("bans the three spellings that competed with it", () => {
    // "lo" (the old HUMAN_VOICE_EDITOR), "saya" (voice-samples.ts) and "anda"
    // each shipped as the house style at some point. Only one can be right.
    for (const banned of ["lo", "saya", "anda"]) {
      expect(ADDRESS_RULE.toLowerCase()).toContain(banned);
    }
  });

  it("never tells a model to address the reader as lo", () => {
    expect(VOICE_RULE).not.toMatch(/sapa.{0,20}"lo"/i);
  });
});

describe("the profile carries what the interview established", () => {
  it("lists every speech tic", () => {
    for (const tic of ["nah", "jadi gini", "gini nih", "make sense"]) {
      expect(SPEECH_TICS.toLowerCase()).toContain(tic);
    }
  });

  it("aims criticism at practice, never at a person or a tool", () => {
    expect(STANCE_RULE).toMatch(/praktik/i);
    expect(STANCE_RULE).toMatch(/tool|orang/i);
  });

  it("makes the humor self-deprecating rather than sarcastic", () => {
    expect(HUMOR_RULE).toMatch(/diri sendiri/i);
  });

  it("orders teaching as problem, then analogy, then code", () => {
    const order = TEACHING_ORDER.toLowerCase();
    expect(order.indexOf("masalah")).toBeLessThan(order.indexOf("analogi"));
    expect(order.indexOf("analogi")).toBeLessThan(order.indexOf("kode"));
  });

  it("stops at why it matters instead of walking through code", () => {
    expect(DEPTH_RULE).toMatch(/kenapa penting/i);
  });

  it("requires an analogy to survive the make-sense test", () => {
    expect(ANALOGY_RULE).toMatch(/make sense/i);
  });

  it("forbids a cover that promises more than the deck delivers", () => {
    expect(HONESTY_RULE).toMatch(/clickbait/i);
  });
});

describe("the voice rule stays out of the publishing contract", () => {
  it("never restates the title or caption caps", () => {
    // TITLE_CAPTION_RULE and HASHTAG_RULE are the only place those live. A
    // second copy here is a second thing to forget to update.
    expect(VOICE_RULE).not.toMatch(/\b90\b|\b2200\b/);
  });

  it("never restates the hashtag count", () => {
    expect(VOICE_RULE).not.toMatch(/hashtag/i);
  });
});
