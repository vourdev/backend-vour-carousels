import { describe, it, expect } from "vitest";
import { sanitizeCustomHtml, CUSTOM_CLASS_WHITELIST } from "@/lib/ds/sanitize";
import { mockupSchema, coverHookSchema } from "@/lib/ds/schema";
import { renderSlide } from "@/lib/ds/render-slide";
import { carouselExtraCss } from "@/lib/ds/carousel-css-extra";

describe("custom fragment sanitizer", () => {
  it("strips inline style attributes in every quoting form", () => {
    const out = sanitizeCustomHtml(
      `<div style="background:red;width:500px"><p style='color:#fff'>a</p><span style=color:blue>b</span></div>`
    );
    expect(out).not.toContain("style");
    expect(out).not.toContain("red");
    expect(out).not.toContain("500px");
    expect(out).toContain("a");
    expect(out).toContain("b");
  });

  it("strips <style> blocks and their declarations, not just the tags", () => {
    const out = sanitizeCustomHtml(
      `<style>.x{background:#ff0000;font-size:90px}</style><div class="x">keep</div>`
    );
    expect(out).not.toContain("background");
    expect(out).not.toContain("#ff0000");
    expect(out).not.toContain("90px");
    expect(out).toContain("keep");
  });

  it("strips <link> so an external stylesheet cannot be pulled in", () => {
    const out = sanitizeCustomHtml(`<link rel="stylesheet" href="x.css"><p>hi</p>`);
    expect(out).not.toContain("link");
    expect(out).not.toContain("stylesheet");
    expect(out).toContain("hi");
  });

  it("strips presentational attributes that survive losing style=", () => {
    const out = sanitizeCustomHtml(
      `<table bgcolor="#f00" cellpadding="8" border="2"><tr><td align="center" width="500">c</td></tr></table>` +
        `<svg viewBox="0 0 10 10"><rect fill="#ff0000" stroke="#00f" width="500" height="500" opacity="0.5" transform="scale(9)"/></svg>`
    );
    for (const gone of ["bgcolor", "cellpadding", "border=", "align", "width", "height", "fill", "stroke", "opacity", "transform"]) {
      expect(out).not.toContain(gone);
    }
    // Structure survives — viewBox is geometry, not styling.
    expect(out).toContain("viewBox");
    expect(out).toContain("c");
  });

  it("keeps whitelisted classes and drops everything else", () => {
    const out = sanitizeCustomHtml(
      `<div class="mt-24 my-hack lede totally-made-up"><p class="nope">x</p></div>`
    );
    expect(out).toContain('class="mt-24 lede"');
    expect(out).not.toContain("my-hack");
    expect(out).not.toContain("totally-made-up");
    // Attribute removed entirely when nothing survives, rather than left as class="".
    expect(out).not.toContain('class=""');
    expect(out).not.toContain("nope");
  });

  it("does not allow tone classes back in through the whitelist", () => {
    // Every tone class hardcodes a literal background — allowing one would hand colour
    // control straight back to the model.
    for (const tone of ["card-peach", "card-mint", "card-sky", "card-pink", "card-amber", "card-stone", "mint", "sky", "pink", "amber", "loser"]) {
      expect(CUSTOM_CLASS_WHITELIST as readonly string[]).not.toContain(tone);
    }
    const out = sanitizeCustomHtml(`<div class="card card-mint">x</div>`);
    expect(out).not.toContain("card-mint");
  });

  it("still strips scripts and event handlers", () => {
    const out = sanitizeCustomHtml(`<div onclick="alert(1)">x</div><script>alert(2)</script>`);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("script");
    expect(out).toContain("x");
  });

  it("returns null when nothing renderable survives", () => {
    expect(sanitizeCustomHtml(`<style>.a{color:red}</style>`)).toBeNull();
    expect(sanitizeCustomHtml(`   `)).toBeNull();
    expect(sanitizeCustomHtml(`<script>alert(1)</script>`)).toBeNull();
  });

  it("has no css field left on either custom channel", () => {
    const mockup = mockupSchema.safeParse({
      type: "custom",
      html: "<p>x</p>",
      css: ".x{color:red}",
    });
    expect(mockup.success).toBe(true);
    if (mockup.success && mockup.data.type === "custom") {
      expect("css" in mockup.data).toBe(false);
    }

    const hook = coverHookSchema.safeParse({
      kind: "custom",
      html: "<p>x</p>",
      css: ".x{color:red}",
    });
    expect(hook.success).toBe(true);
    if (hook.success && hook.data.kind === "custom") {
      expect("css" in hook.data).toBe(false);
    }
  });
});

describe("custom fragment rendering", () => {
  const slide = (html: string) =>
    ({
      role: "point" as const,
      counter: "02 / 05",
      eyebrow: "BESPOKE",
      headline: "Judul",
      body: "Body copy.",
      mockup: { type: "custom" as const, html },
    });

  it("survives an adversarial fragment that asks for red 500px everything", () => {
    // The TASK-6 scenario: the model is told to make it red and 500px wide.
    const html = renderSlide(
      slide(
        `<style>.boom{background:#ff0000;width:500px;height:500px}</style>` +
          `<div class="boom" style="background:red;width:500px;font-size:120px" bgcolor="#f00">` +
          `<h3 style="color:#ff0000">Merah</h3><p>Lima ratus piksel</p></div>`
      ),
      3
    );
    expect(html).toContain("Merah");
    expect(html).toContain("Lima ratus piksel");
    for (const gone of ["#ff0000", "background:red", "500px", "120px", "bgcolor", "boom", "style="]) {
      expect(html).not.toContain(gone);
    }
    // and it still lands in the styled wrapper, so it is not unstyled either
    expect(html).toContain("cm cm-base");
  });

  it("falls back to the auto card when the fragment is pure styling", () => {
    const html = renderSlide(slide(`<style>.a{color:red}</style>`), 1);
    expect(html).not.toContain("cm-base");
    // resolveMockup's auto-fallback card, built from the slide's own copy.
    expect(html).toContain("BESPOKE");
    expect(html).toContain("Body copy.");
  });
});

describe("custom mockup base styling (TASK 6)", () => {
  it("gives the sanitized fragment a real panel, not bare text on the canvas", () => {
    // Everything the fragment carried was stripped, so these defaults are the only
    // appearance it has. Without them it renders as a floating paragraph.
    const base = carouselExtraCss.slice(carouselExtraCss.indexOf(".cm-base {"));
    const rule = base.slice(0, base.indexOf("}") + 1);
    expect(rule).toMatch(/padding:\s*36px 40px/);
    expect(rule).toMatch(/background:\s*var\(--ms-panel\)/);
    expect(rule).toMatch(/border-radius:\s*20px/);
    expect(rule).toMatch(/border:\s*1\.5px solid var\(--ms-line\)/);
    expect(rule).toMatch(/font-family:\s*'Inter'/);
  });

  it("keeps every panel colour on a surface token, so Ink and Paper both work", () => {
    const from = carouselExtraCss.indexOf(".cm-base {");
    const to = carouselExtraCss.indexOf(".cm-base hr");
    const block = carouselExtraCss.slice(from, to);
    // A literal hex here would be correct on one surface and invisible on the other.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
