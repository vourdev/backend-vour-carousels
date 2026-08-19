import { describe, it, expect } from "vitest";
import { sanitizeHookHtml } from "@/lib/ds/sanitize";

describe("sanitizeHookHtml", () => {
  it("strips <script> blocks", () => {
    const out = sanitizeHookHtml('<div>ok</div><script>alert(1)</script>');
    expect(out).toContain("<div>ok</div>");
    expect(out).not.toContain("alert(1)");
    expect(out.toLowerCase()).not.toContain("<script");
  });
  it("strips inline event handlers", () => {
    const out = sanitizeHookHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain('src="x"');
  });
  it("strips javascript: urls", () => {
    const out = sanitizeHookHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });
  it("strips event handlers with no whitespace before them", () => {
    // Classic filter bypass: the handler abuts the previous attribute's closing
    // quote, so a \s-anchored regex misses it. The delimiter must survive.
    const out = sanitizeHookHtml('<img src="x"onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain('src="x"');
  });
  it("keeps non-handler attributes that merely start with 'on'", () => {
    const html = '<div only="1" once="yes">hi</div>';
    expect(sanitizeHookHtml(html)).toBe(html);
  });
  it("still strips real handlers whose names start with those letters", () => {
    const out = sanitizeHookHtml('<div onload="a()" onclick="b()">hi</div>');
    expect(out).not.toMatch(/onload|onclick/i);
    expect(out).toContain(">hi</div>");
  });
  it("keeps benign styled markup", () => {
    const html = '<div class="hook" style="color:red"><span>hi</span></div>';
    expect(sanitizeHookHtml(html)).toBe(html);
  });
});
