import { describe, it, expect } from "vitest";
import { diagLines } from "@/lib/ds/hub-lines";

describe("diagLines", () => {
  it("draws 4 paths + 4 arrowheads for 4 nodes", () => {
    const svg = diagLines(4, { viewH: 400, midY: 220, endY: 320 });
    expect((svg.match(/<path /g) ?? []).length).toBe(4);
    expect((svg.match(/<polygon /g) ?? []).length).toBe(4);
    expect(svg).toContain('viewBox="0 0 920 400"');
    expect(svg).toContain("M 460 96");
  });
  it("draws 3 paths + 3 arrowheads for 3 nodes", () => {
    const svg = diagLines(3, { viewH: 380, midY: 200, endY: 300 });
    expect((svg.match(/<path /g) ?? []).length).toBe(3);
    expect((svg.match(/<polygon /g) ?? []).length).toBe(3);
    expect(svg).toContain('viewBox="0 0 920 380"');
  });
  it("draws 2 paths for 2 nodes", () => {
    const svg = diagLines(2, { viewH: 400, midY: 220, endY: 320 });
    expect((svg.match(/<path /g) ?? []).length).toBe(2);
  });
  it("clamps an out-of-range count to 4", () => {
    const svg = diagLines(6, { viewH: 400, midY: 220, endY: 320 });
    expect((svg.match(/<path /g) ?? []).length).toBe(4);
  });
});
