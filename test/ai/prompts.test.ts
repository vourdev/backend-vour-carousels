import { describe, it, expect } from "vitest";
import {
  briefSystem,
  briefUserPrompt,
  planSystem,
  planUserPrompt,
  reviseSystem,
  reviseUserPrompt,
  scopeClassifierSystem,
  scopedSlideReviseSystem,
  scopedSlideRevisePrompt,
  scopedGlobalReviseSystem,
  scopedGlobalRevisePrompt,
  scopedBriefRevisePrompt,
  humanVoiceEditorSystem,
  humanVoiceEditorUserPrompt,
} from "@/lib/ai/prompts";

describe("prompt builders", () => {
  it("brief system encodes the canonical brief + copy caps", () => {
    expect(briefSystem).toMatch(/eyebrow/i);
    expect(briefSystem).toMatch(/cover|outro/i);
  });
  it("brief user prompt embeds the idea", () => {
    expect(briefUserPrompt("idempotency di API")).toContain("idempotency di API");
  });
  it("plan system lists the supported roles", () => {
    expect(planSystem).toMatch(/cover/);
    expect(planSystem).toMatch(/point/);
    expect(planSystem).toMatch(/outro/);
  });
  it("plan user prompt embeds the brief", () => {
    expect(planUserPrompt("# Brief\ncontent")).toContain("# Brief");
  });
  it("revise prompt embeds both the current plan and the instruction", () => {
    const p = reviseUserPrompt('{"slides":[]}', "shorten slide 3");
    expect(p).toContain('{"slides":[]}');
    expect(p).toContain("shorten slide 3");
  });
  it("enforces exactly 5 hashtags with fyp first and vourdev last (TikTok cap)", () => {
    for (const sys of [briefSystem, planSystem, reviseSystem]) {
      expect(sys).toMatch(/EXACTLY 5/);
      expect(sys).toMatch(/TikTok accepts at most 5/);
      expect(sys).toMatch(/"fyp" first/);
      expect(sys).toMatch(/"vourdev" last/);
    }
    expect(briefSystem).toContain("#fyp #<topic1> #<topic2> #<topic3> #vourdev");
  });
  it("briefSystem and planSystem enforce #fyp hashtag and informative content", () => {
    expect(briefSystem).toMatch(/#fyp/);
    expect(planSystem).toMatch(/fyp/);
  });

  /**
   * These two fields are posted verbatim to Instagram and TikTok and are
   * schema-enforced, so both prompts have to state the same caps the schema
   * will reject on — and the caption's fixed shape, so a revision cannot
   * quietly restructure what generation produced.
   */
  it("states the title and caption caps wherever those fields are produced", () => {
    for (const sys of [briefSystem, planSystem, scopedGlobalReviseSystem]) {
      expect(sys).toMatch(/≤ 90 characters/);
      expect(sys).toMatch(/≤ 2200 characters/);
      expect(sys).toMatch(/non-empty/i);
      expect(sys).toMatch(/CTA/);
    }
  });

  it("forbids hashtags inside the caption, which the publisher appends separately", () => {
    for (const sys of [briefSystem, planSystem, scopedGlobalReviseSystem]) {
      expect(sys).toMatch(/NEVER put hashtags in the caption|No hashtags anywhere in the caption/);
    }
  });
  it("planSystem documents all 10 mockup types", () => {
    expect(planSystem).toContain('"terminal"');
    expect(planSystem).toContain('"comparison"');
    expect(planSystem).toContain('"steps"');
    expect(planSystem).toContain('"callout"');
    expect(planSystem).toContain('"bigstat"');
    expect(planSystem).toContain('"card"');
    expect(planSystem).toContain('"flow"');
    expect(planSystem).toContain('"hub"');
    expect(planSystem).toContain('"concept"');
    expect(planSystem).toContain('"checklist"');
  });
  it("briefSystem instructs varied mockup types", () => {
    expect(briefSystem).toMatch(/Terminal/);
    expect(briefSystem).toMatch(/Comparison/);
    expect(briefSystem).toMatch(/Steps/);
    expect(briefSystem).toMatch(/Callout/);
    expect(briefSystem).toMatch(/BigStat/);
    expect(briefSystem).toMatch(/VARY/i);
  });
  it("reviseSystem includes instructions for slide targeting and outro editing", () => {
    expect(reviseSystem).toMatch(/outro/i);
    expect(reviseSystem).toMatch(/cover/i);
    expect(reviseSystem).toMatch(/ACCENT WORD/i);
    expect(reviseSystem).toMatch(/IDENTIFY TARGET SLIDE/i);
  });
});

describe("planSystem", () => {
  it("documents the cover device hook", () => {
    expect(planSystem).toMatch(/hook/);
    expect(planSystem).toMatch(/device/);
    expect(planSystem).toMatch(/chrome/);
  });
  it("requires an outro cta", () => {
    expect(planSystem).toMatch(/cta/);
    expect(planSystem.toLowerCase()).toMatch(/call.?to.?action|cta/);
  });
  it("enforces the icon allowlist with a sparkles fallback", () => {
    expect(planSystem).toContain("ICON RULES");
    expect(planSystem).toContain("sparkles");
    expect(planSystem).not.toContain("<lucide:slug>");
  });
  it("makes the cover hook optional (text-only intro allowed)", () => {
    expect(planSystem).toMatch(/hook is OPTIONAL/);
    expect(planSystem).toMatch(/text-only cover/i);
  });
  it("makes mockup choice context-driven and caps terminal at once per deck", () => {
    expect(planSystem).toMatch(/CONTEXT-DRIVEN MOCKUP CHOICE/);
    expect(planSystem).toMatch(/code\/UI is the point/i);
    expect(planSystem).toMatch(/MAX 1 per 5 slides|AT MOST ONCE per deck/i);
  });
});

describe("briefSystem intro examples", () => {
  it("includes a text-only cover example", () => {
    expect(briefSystem).toContain("istilah AI yang wajib lo");
  });
});

describe("reviseSystem", () => {
  it("covers editing the hook and the cta", () => {
    expect(reviseSystem).toMatch(/hook/);
    expect(reviseSystem).toMatch(/cta/);
  });
});

describe("humanVoiceEditorSystem", () => {
  it("encodes anti-agentic rules and voice signature", () => {
    expect(humanVoiceEditorSystem).toContain("PEMBUKA GENERIK");
    expect(humanVoiceEditorSystem).toContain("HEDGING BERLEBIHAN");
    expect(humanVoiceEditorSystem).toContain("TRANSISI FORMULAIK");
    expect(humanVoiceEditorSystem).toContain("PENJELASAN BERLEBIHAN");
    expect(humanVoiceEditorSystem).toContain("RANGKUMAN PENUTUP KLISE");
    expect(humanVoiceEditorSystem).toContain("KESEIMBANGAN PALSU");
    expect(humanVoiceEditorSystem).toContain("@vourdev");
  });

  it("builds user prompt with brief payload", () => {
    const prompt = humanVoiceEditorUserPrompt("# Draft Brief");
    expect(prompt).toContain("# Draft Brief");
    expect(prompt).toContain("Perform the Human Voice Editor pass now");
  });
});

describe("mockup classification rules", () => {
  it("routes log/terminal content to the terminal mockup, annotations included", () => {
    // TASK 5: annotated log output was being drawn as a custom fragment.
    expect(planSystem).toMatch(/LOG \/ OUTPUT \/ TERMINAL CONTENT → ALWAYS "terminal", NEVER custom/);
    expect(planSystem).toContain("⚡");
    expect(planSystem).toContain("💥");
    expect(planSystem).toMatch(/\[REQ A\]/);
    // and the few-shot shows the shape it must produce
    expect(planSystem).toContain('"filename": "race.log"');
    expect(planSystem).toMatch(/NOT \{ "type": "custom"/);
  });

  it("tells the custom escape hatch to stay out of log content", () => {
    expect(planSystem).toMatch(/NEVER for log\/terminal\/output content/);
  });

  it("caps concept children at 3 everywhere it is described", () => {
    expect(planSystem).not.toMatch(/concept[^.]{0,40}3-4 children/i);
    expect(planSystem).toMatch(/MAX 3 children/);
  });

  it("no longer promises the model a fixed illustration pixel size", () => {
    // The renderer sizes illustrations from the free space now; a stale "240×240px"
    // here would teach the model that it has a size to reason about.
    expect(planSystem).not.toContain("240×240");
    expect(planSystem).not.toContain("180×180");
  });
});

describe("scoped revision prompts", () => {
  it("asks only for the target slides and forbids returning the rest", () => {
    expect(scopedSlideReviseSystem).toMatch(/EXACTLY the target indices/);
    expect(scopedSlideReviseSystem).toMatch(/Never return a slide that is not in the target list/);
    expect(scopedSlideReviseSystem).toMatch(/carried over in code/);
  });

  it("states that changing a mockup type is supported, and names the slug trap", () => {
    expect(scopedSlideReviseSystem).toMatch(/CHANGING A SLIDE'S MOCKUP TYPE IS EXPLICITLY SUPPORTED/);
    expect(scopedSlideReviseSystem).toMatch(/silently replaced\s+with a generic fallback image/);
  });

  it("carries the illustration allowlist, which the old revise prompt did not", () => {
    // Without the catalog the model invents a slug, normalizeIllustration coerces it to
    // the fallback, and "tambahkan illustration" looks like it worked.
    expect(scopedSlideReviseSystem).toContain("online-learning_tgmv");
  });

  it("puts the full plan in the prompt as read-only context", () => {
    const p = scopedSlideRevisePrompt('{"title":"T"}', [{ index: 2, slideJson: "{}" }], "perpendek", []);
    expect(p).toMatch(/READ-ONLY CONTEXT/);
    expect(p).toContain('{"title":"T"}');
    expect(p).toMatch(/SLIDE 2 \(target\)/);
  });

  it("scopes the global editor to the named fields only", () => {
    const p = scopedGlobalRevisePrompt("{}", ["caption"], "lebih pendek", []);
    expect(p).toMatch(/TARGET FIELDS: caption/);
    expect(p).toMatch(/Return only caption/);
    expect(scopedGlobalReviseSystem).toMatch(/do not return them/);
  });

  it("replays revision history into the scoped prompts too", () => {
    const p = scopedSlideRevisePrompt("{}", [{ index: 1, slideJson: "{}" }], "lagi", [
      { request: "perpendek headline slide 1", outcome: "slide 1: headline" },
    ]);
    expect(p).toMatch(/REVISION HISTORY/);
    expect(p).toContain("perpendek headline slide 1");
  });

  it("keeps the classifier out of the business of editing", () => {
    expect(scopeClassifierSystem).toMatch(/You do NOT perform the revision/);
    expect(scopeClassifierSystem).toMatch(/If in doubt, set wholeDeck: true/);
  });
});

describe("scoped brief revision prompt", () => {
  it("names the target sections and forbids returning the document", () => {
    const p = scopedBriefRevisePrompt("# Slide 1\n", ["# Slide 1 — Cover"], "perpendek", []);
    expect(p).toMatch(/TARGET SECTIONS/);
    expect(p).toContain("# Slide 1 — Cover");
    expect(p).toMatch(/Do NOT return the rest of the document/);
  });
});
