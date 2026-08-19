import { describe, it, expect } from "vitest";
import {
  revisionHistoryBlock,
  reviseUserPrompt,
  briefRevisionPrompt,
  reviseSystem,
} from "@/lib/ai/prompts";

describe("revision memory in prompts", () => {
  it("adds nothing on the first turn", () => {
    expect(revisionHistoryBlock([])).toBe("");
    const p = reviseUserPrompt("{}", "shorten the headline");
    expect(p).not.toContain("REVISION HISTORY");
  });

  it("replays earlier turns oldest-first with their outcomes", () => {
    const block = revisionHistoryBlock([
      { request: "shorten slide 2", outcome: "slide 2 (point): headline" },
      { request: "swap the mockup", outcome: "slide 2 (point): mockup callout->bigstat" },
    ]);
    expect(block).toContain("REVISION HISTORY");
    expect(block.indexOf("shorten slide 2")).toBeLessThan(block.indexOf("swap the mockup"));
    expect(block).toContain("result: slide 2 (point): mockup callout->bigstat");
  });

  it("puts the history before the plan so the new request reads last", () => {
    const p = reviseUserPrompt("{PLAN}", "again but shorter", [{ request: "shorten it" }]);
    expect(p.indexOf("REVISION HISTORY")).toBeLessThan(p.indexOf("{PLAN}"));
    expect(p.indexOf("{PLAN}")).toBeLessThan(p.indexOf("NEW USER REVISION REQUEST"));
  });

  it("carries the same history into the Gate-1 brief revision", () => {
    const p = briefRevisionPrompt("# Brief", "make it punchier", [{ request: "cut the intro" }]);
    expect(p).toContain("REVISION HISTORY");
    expect(p).toContain("cut the intro");
    expect(p).toContain("# Brief");
    expect(p).toContain("make it punchier");
  });

  it("instructs the model not to undo accepted revisions", () => {
    expect(reviseSystem).toMatch(/REVISION HISTORY/);
    expect(reviseSystem).toMatch(/NEVER undo/i);
    expect(reviseSystem).toMatch(/NEW request wins/i);
  });
});
