import { describe, it, expect, vi } from "vitest";
import { extractAndParseJson } from "@/lib/ai/generate";

/**
 * Revisions come back as text, not as a structured response — OmniRoute does not
 * implement `responseFormat`, so `generateObject` can never succeed against it and every
 * path falls through to parsing prose. That makes the parser part of whether the feature
 * works at all: a revision that dies on a stray comma is one the user has to ask for
 * twice, and the second attempt costs another model call on the slow link.
 *
 * Measured against the live model on 25 Aug 2026: the same request produced valid JSON on
 * one attempt and `Expected ',' or '}' after property value at position 1005` on another.
 */
describe("extractAndParseJson", () => {
  it("parses clean JSON untouched", () => {
    expect(extractAndParseJson('{"slides":[{"index":2}]}')).toEqual({ slides: [{ index: 2 }] });
  });

  it("unwraps a markdown fence", () => {
    expect(extractAndParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose on either side of the object", () => {
    expect(extractAndParseJson('Sure! Here it is:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it("survives a trailing comma", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(extractAndParseJson('{"slides":[{"index":2},],}')).toEqual({ slides: [{ index: 2 }] });
    warn.mockRestore();
  });

  /** A model writing multi-line slide copy emits raw newlines inside strings constantly. */
  it("escapes a literal newline inside a string instead of failing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = extractAndParseJson('{"body":"baris satu\nbaris dua"}');
    expect(out.body).toBe("baris satu\nbaris dua");
    warn.mockRestore();
  });

  it("recovers a response that was cut off mid-string", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = extractAndParseJson('{"slides":[{"index":2,"slide":{"headline":"kena potong');
    expect(out.slides[0].slide.headline).toBe("kena potong");
    warn.mockRestore();
  });

  it("recovers a response that was cut off between fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = extractAndParseJson('{"slides":[{"index":2},{"index":3}');
    expect(out.slides).toHaveLength(2);
    warn.mockRestore();
  });

  it("keeps escaped quotes and backslashes intact", () => {
    const out = extractAndParseJson('{"a":"dia bilang \\"halo\\"","b":"C:\\\\tmp"}');
    expect(out.a).toBe('dia bilang "halo"');
    expect(out.b).toBe("C:\\tmp");
  });

  /** Salvage must not invent a value out of something that is not JSON at all. */
  /** Observed live: `Expected ',' or ']' after array element at position 986`. */
  it("inserts a comma the model dropped between array elements", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = extractAndParseJson('{"slides":[{"index":2} {"index":3}]}');
    expect(out.slides).toEqual([{ index: 2 }, { index: 3 }]);
    warn.mockRestore();
  });

  it("inserts a comma the model dropped between strings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(extractAndParseJson('{"items":["satu" "dua"]}')).toEqual({ items: ["satu", "dua"] });
    warn.mockRestore();
  });

  it("does not put a comma between a key and its value", () => {
    expect(extractAndParseJson('{"a":"b","c":"d"}')).toEqual({ a: "b", c: "d" });
  });

  it("still throws when there is nothing to salvage", () => {
    expect(() => extractAndParseJson("maaf, saya tidak bisa membantu")).toThrow();
  });

  it("reports the original fault, not the salvage attempt's", () => {
    expect(() => extractAndParseJson('{"a": @@@ }')).toThrow(/JSON/i);
  });
});
