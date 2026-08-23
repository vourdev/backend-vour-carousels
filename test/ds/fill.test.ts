import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml, fillTemplate } from "@/lib/ds/fill";

describe("escapeHtml", () => {
  it("escapes angle brackets, ampersand, quotes", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  /* ── markdown emphasis, rescued into the accent span ─────────────────────────
   * The brief marks the accent word as **word** and the plan step is supposed to lift it
   * into `accentWord`. When it does not, the asterisks reach the canvas and print. */

  it("converts markdown bold into the accent span", () => {
    expect(escapeHtml("Kirim **payload** ke worker")).toBe(
      'Kirim <span class="a">payload</span> ke worker'
    );
  });

  it("keeps the emphasised text rather than deleting it", () => {
    const out = escapeHtml("**payload**");
    expect(out).toContain("payload");
    expect(out).not.toContain("*");
  });

  it("escapes the emphasised text before wrapping it", () => {
    expect(escapeHtml("**<script>**")).toBe('<span class="a">&lt;script&gt;</span>');
  });

  it("converts every pair, so nothing is left printing asterisks", () => {
    expect(escapeHtml("**a** dan **b**")).toBe(
      '<span class="a">a</span> dan <span class="a">b</span>'
    );
  });

  it("leaves a lone asterisk alone", () => {
    // `SELECT *` is real copy on a database slide; only matched pairs are notation.
    expect(escapeHtml("SELECT * FROM users")).toBe("SELECT * FROM users");
    expect(escapeHtml("2 ** 8")).toBe("2 ** 8");
  });

  it("leaves an unclosed marker alone rather than swallowing the rest of the line", () => {
    expect(escapeHtml("**payload ke worker")).toBe("**payload ke worker");
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

  /**
   * escapeHtml emits an element now, which is only safe because no attribute in any
   * template is filled with free-form model copy.
   *
   * Every `{{slot}}` sitting inside an attribute carries a renderer-derived or
   * schema-enumerated value — surface, layout, tone, HTTP method, brand src — none of
   * which can contain an asterisk. A template that puts model prose in an attribute would
   * turn the rescue into broken markup, so the set is pinned here rather than trusted.
   */
  it("never fills an attribute with a slot that could carry model prose", () => {
    const dir = join(__dirname, "../../src/lib/ds/templates");
    const allowed = new Set([
      "coverSurface",
      "surfaceClass",
      "method",
      "stepTone",
      "cardTone",
      "eyebrowClass",
      "layout",
      "brand",
    ]);

    const found = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const attr of src.match(/[a-zA-Z-]+="[^"]*\{\{[^"]*"/g) ?? []) {
        for (const slot of attr.match(/\{\{(\w+)\}\}/g) ?? []) {
          found.add(slot.slice(2, -2));
        }
      }
    }

    expect([...found].sort()).toEqual([...allowed].sort());
  });
});
