import { describe, it, expect } from "vitest";
import { slidePlanSchema, mockupSchema, slideSchema, coverHookSchema } from "@/lib/ds/schema";

const valid = {
  title: "Test",
  caption: "cap",
  hashtags: ["fyp", "backend", "api", "database", "vourdev"],
  slides: [
    { role: "cover", eyebrow: "BACKEND", headline: "Idempotency", accentWord: "Idempotency" },
    { role: "point", counter: "02 / 05", eyebrow: "WHY", headline: "It matters", body: "because." },
    { role: "outro", headline: "Follow @vourdev", cta: { strong: "Follow @vourdev" } },
  ],
};

describe("slidePlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(slidePlanSchema.parse(valid).slides).toHaveLength(3);
  });
  it("rejects an unknown role", () => {
    const bad = { ...valid, slides: [{ role: "banana", headline: "x" }] };
    expect(() => slidePlanSchema.parse(bad)).toThrow();
  });
  it("rejects a card tone outside the palette", () => {
    const bad = {
      ...valid,
      slides: [{ role: "point", counter: "1/1", eyebrow: "E", headline: "H", body: "b",
        card: { icon: "lucide:box", title: "T", body: "B", tone: "turquoise" } }],
    };
    expect(() => slidePlanSchema.parse(bad)).toThrow();
  });
  it("accepts an outro with a cta", () => {
    const plan = {
      ...valid,
      slides: [
        { role: "cover", eyebrow: "E", headline: "H", accentWord: "H" },
        { role: "outro", headline: "Follow @vourdev", accentWord: "@vourdev",
          cta: { strong: "Simpan & bagikan", sub: "Biar nggak lupa." } },
      ],
    };
    expect(slidePlanSchema.parse(plan).slides).toHaveLength(2);
  });

  it("rejects an outro missing its cta", () => {
    const bad = { ...valid, slides: [{ role: "outro", headline: "No cta here" }] };
    expect(() => slidePlanSchema.parse(bad)).toThrow();
  });
});

describe("mockupSchema", () => {
  it("accepts a card mockup", () => {
    const m = mockupSchema.parse({ type: "card", icon: "lucide:box", title: "T", body: "B", tone: "peach" });
    expect(m.type).toBe("card");
  });
  it("accepts a terminal mockup", () => {
    const m = mockupSchema.parse({
      type: "terminal",
      filename: "app.ts",
      lines: [
        { text: "// hello", style: "cmt" },
        { text: "const x = 1;", style: "plain" },
      ],
    });
    expect(m.type).toBe("terminal");
  });
  it("accepts a comparison mockup", () => {
    const m = mockupSchema.parse({
      type: "comparison",
      loserLabel: "Bad", loserLine: "No types",
      winnerLabel: "Good", winnerLine: "TypeScript",
    });
    expect(m.type).toBe("comparison");
  });
  it("accepts a steps mockup with 2-4 items", () => {
    const m = mockupSchema.parse({
      type: "steps",
      items: [
        { title: "Step 1", body: "Do this" },
        { title: "Step 2", body: "Do that" },
      ],
    });
    expect(m.type).toBe("steps");
  });
  it("rejects a steps mockup with fewer than 2 items", () => {
    expect(() => mockupSchema.parse({
      type: "steps",
      items: [{ title: "Only one", body: "step" }],
    })).toThrow();
  });
  it("accepts a callout mockup", () => {
    const m = mockupSchema.parse({ type: "callout", icon: "lucide:alert-triangle", text: "Warning!" });
    expect(m.type).toBe("callout");
  });
  it("accepts a bigstat mockup", () => {
    const m = mockupSchema.parse({ type: "bigstat", number: "3×", unit: "faster", caption: "Than sync render" });
    expect(m.type).toBe("bigstat");
  });
  it("accepts a bigstat without unit", () => {
    const m = mockupSchema.parse({ type: "bigstat", number: "80%", caption: "Less code" });
    expect(m.type).toBe("bigstat");
  });
  it("accepts a point slide with mockup field", () => {
    const plan = slidePlanSchema.parse({
      ...valid,
      slides: [
        { role: "cover", eyebrow: "TEST", headline: "Test" },
        {
          role: "point", counter: "01/03", eyebrow: "E", headline: "H", body: "b",
          mockup: { type: "terminal", filename: "x.ts", lines: [{ text: "hi", style: "plain" }] },
        },
        { role: "outro", headline: "Done", cta: { strong: "Save it" } },
      ],
    });
    const point = plan.slides[1];
    expect(point.role).toBe("point");
    if (point.role === "point") {
      expect(point.mockup?.type).toBe("terminal");
    }
  });
  it("rejects point slide body exceeding max length limit", () => {
    const overlyLongBody = "a".repeat(200);
    expect(() => slidePlanSchema.parse({
      ...valid,
      slides: [
        { role: "point", counter: "01/01", eyebrow: "TEST", headline: "H", body: overlyLongBody },
      ],
    })).toThrow();
  });
});

describe("coverHookSchema", () => {
  it("accepts a device hook", () => {
    const h = coverHookSchema.parse({
      kind: "device", chrome: "browser", label: "app.tsx",
      lines: [{ text: "const t = decode(jwt)", style: "kw" }],
    });
    expect(h.kind).toBe("device");
  });
  it("accepts a custom hook", () => {
    const h = coverHookSchema.parse({ kind: "custom", html: "<div>hi</div>" });
    expect(h.kind).toBe("custom");
  });
  it("rejects a device hook with zero lines", () => {
    expect(() => coverHookSchema.parse({ kind: "device", chrome: "browser", lines: [] })).toThrow();
  });
  it("rejects a device hook with more than six lines", () => {
    const lines = Array.from({ length: 7 }, () => ({ text: "x", style: "plain" }));
    expect(() => coverHookSchema.parse({ kind: "device", chrome: "terminal", lines })).toThrow();
  });
});

describe("icon coercion", () => {
  it("strips lucide: prefix on a card mockup icon", () => {
    const m = mockupSchema.parse({
      type: "card", icon: "lucide:repeat", title: "T", body: "B", tone: "peach",
    });
    expect(m.type === "card" && m.icon).toBe("repeat");
  });
  it("coerces an unknown callout icon to the fallback (no throw)", () => {
    const m = mockupSchema.parse({
      type: "callout", icon: "lucide:made-up-xyz", text: "hi",
    });
    expect(m.type === "callout" && m.icon).toBe("sparkles");
  });
  it("coerces a legacy point card icon", () => {
    const s = slideSchema.parse({
      role: "point", counter: "1/1", eyebrow: "E", headline: "H", body: "b",
      card: { icon: "lucide:box", title: "T", body: "B", tone: "mint" },
    });
    expect(s.role === "point" && s.card?.icon).toBe("box");
  });
});

describe("flow mockup", () => {
  it("parses a flow with focus + note", () => {
    const m = mockupSchema.parse({
      type: "flow",
      steps: [{ label: "Request" }, { label: "Handler", focus: true }, { label: "DB" }],
      note: "Alur request masuk.",
    });
    expect(m.type).toBe("flow");
  });
  it("rejects a flow with 1 step (min 2)", () => {
    expect(() => mockupSchema.parse({ type: "flow", steps: [{ label: "x" }] })).toThrow();
  });
});

describe("concept mockup", () => {
  it("parses a concept with 4 children", () => {
    const m = mockupSchema.parse({
      type: "concept", parent: "HTTP",
      children: ["GET", "POST", "PUT", "DELETE"],
    });
    expect(m.type).toBe("concept");
  });
  it("rejects a concept with 1 child (min 2)", () => {
    expect(() => mockupSchema.parse({ type: "concept", parent: "x", children: ["a"] })).toThrow();
  });
});

describe("hub mockup", () => {
  it("parses a hub and coerces tool icons to the allowlist", () => {
    const m = mockupSchema.parse({
      type: "hub", center: "API",
      tools: [
        { icon: "lucide:database", label: "DB" },
        { icon: "made-up-xyz", label: "Cache" },
        { icon: "cloud", label: "CDN" },
      ],
    });
    expect(m.type).toBe("hub");
    if (m.type === "hub") {
      expect(m.tools[0].icon).toBe("database");
      expect(m.tools[1].icon).toBe("sparkles");
    }
  });
  it("rejects a hub with 5 tools (max 4)", () => {
    const tools = Array.from({ length: 5 }, () => ({ icon: "box", label: "x" }));
    expect(() => mockupSchema.parse({ type: "hub", center: "c", tools })).toThrow();
  });
});

describe("checklist mockup", () => {
  it("parses a checklist with items", () => {
    const m = mockupSchema.parse({ type: "checklist", items: ["A", "B", "C"] });
    expect(m.type).toBe("checklist");
  });
  it("rejects a checklist with 7 items (max 6)", () => {
    const items = Array.from({ length: 7 }, (_, i) => `item ${i}`);
    expect(() => mockupSchema.parse({ type: "checklist", items })).toThrow();
  });
});

describe("concept mockup child cap", () => {
  it("keeps 2 and 3 children as-is", () => {
    for (const children of [["A", "B"], ["A", "B", "C"]]) {
      const out = mockupSchema.parse({ type: "concept", parent: "P", children });
      expect(out).toMatchObject({ children });
    }
  });

  it("slices a 4th child away instead of rejecting the plan", () => {
    // Rejecting would throw away an otherwise valid deck, and would break re-parsing
    // the plans in the history table that were generated when the cap was 4.
    const out = mockupSchema.parse({ type: "concept", parent: "P", children: ["A", "B", "C", "D"] });
    expect(out).toMatchObject({ children: ["A", "B", "C"] });
  });

  it("still rejects fewer than 2 children", () => {
    expect(() => mockupSchema.parse({ type: "concept", parent: "P", children: ["A"] })).toThrow();
  });
});
