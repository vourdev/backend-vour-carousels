import { describe, it, expect } from "vitest";
import { escapeHtml, fillTemplate } from "@/lib/ds/fill";

describe("escapeHtml", () => {
  it("escapes angle brackets, ampersand, quotes", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("fillTemplate", () => {
  it("fills named slots with escaped values", () => {
    expect(fillTemplate("Hi {{name}}", { name: "<b>" })).toBe("Hi &lt;b&gt;");
  });
  it("blanks unknown slots", () => {
    expect(fillTemplate("a{{x}}b", {})).toBe("ab");
  });
  it("keeps an optional block when its key is non-empty", () => {
    expect(fillTemplate("{{#lede}}<p>{{lede}}</p>{{/lede}}", { lede: "hi" })).toBe("<p>hi</p>");
  });
  it("drops an optional block when its key is empty/absent", () => {
    expect(fillTemplate("x{{#lede}}<p>{{lede}}</p>{{/lede}}y", {})).toBe("xy");
  });
});
