import { describe, it, expect } from "vitest";
import { compressFlowSteps, FLOW_MAX_STEPS, slidePlanSchema } from "@/lib/ds/schema";
import { renderSlide } from "@/lib/ds/render-slide";

/**
 * A flow chain is one row of at most three nodes.
 *
 * `.diag-flow` used to wrap, so a fourth step landed on a second row carrying its own
 * arrow — which reads as the chain forking. Every flow slide in the carousels history
 * came back with exactly four steps, so this was the normal output rather than an edge
 * case, and every one of them was linear: the fork existed only in the rendering.
 */
describe("compressFlowSteps", () => {
  it("leaves a chain that already fits alone", () => {
    const steps = [{ label: "A" }, { label: "B" }, { label: "C" }];
    expect(compressFlowSteps(steps)).toEqual(steps);
    expect(compressFlowSteps([{ label: "A" }, { label: "B" }])).toHaveLength(2);
  });

  it("keeps the conclusion instead of slicing it off the end", () => {
    // The real slide. "n8n Trigger" is the point of putting a queue in front of it, so a
    // slice(0, 3) would delete the reason the slide exists.
    const out = compressFlowSteps([
      { label: "Next.js Webhook" },
      { label: "Redis Queue", focus: true },
      { label: "Worker Process" },
      { label: "n8n Trigger" },
    ]);
    expect(out.map((s) => s.label)).toEqual(["Next.js Webhook", "Redis Queue", "n8n Trigger"]);
  });

  it("falls back to the first middle step when nothing is marked focus", () => {
    const out = compressFlowSteps([
      { label: "Client Action" },
      { label: "revalidatePath" },
      { label: "Re-render Tree" },
      { label: "Huge Delay" },
    ]);
    expect(out.map((s) => s.label)).toEqual(["Client Action", "revalidatePath", "Huge Delay"]);
  });

  it("never returns more than the cap, however long the chain", () => {
    const long = Array.from({ length: 9 }, (_, i) => ({ label: `n${i}` }));
    const out = compressFlowSteps(long);
    expect(out).toHaveLength(FLOW_MAX_STEPS);
    expect(out[0].label).toBe("n0");
    expect(out[out.length - 1].label).toBe("n8");
  });

  it("invents no label the model did not write", () => {
    const src = [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }];
    const labels = new Set(src.map((s) => s.label));
    for (const s of compressFlowSteps(src)) expect(labels.has(s.label)).toBe(true);
  });
});

describe("flow mockup through the schema", () => {
  const planWith = (steps: unknown) => ({
    title: "t",
    caption: "c",
    hashtags: ["a", "b", "c", "d", "e"],
    slides: [
      {
        role: "point",
        counter: "01",
        eyebrow: "E",
        headline: "H",
        body: "B",
        mockup: { type: "flow", steps },
      },
    ],
  });

  it("accepts an over-long chain and folds it, rather than rejecting the deck", () => {
    // Rejecting would throw away an otherwise good deck, and would break re-parsing the
    // plans in the carousels history that were written when the cap was 5.
    const parsed = slidePlanSchema.parse(
      planWith([{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }])
    );
    const slide = parsed.slides[0];
    if (slide.role !== "point" || slide.mockup?.type !== "flow") throw new Error("shape");
    expect(slide.mockup.steps).toHaveLength(FLOW_MAX_STEPS);
  });

  it("still rejects a chain with nothing to chain", () => {
    expect(() => slidePlanSchema.parse(planWith([{ label: "only" }]))).toThrow();
  });

  /**
   * /api/assemble and /api/capture cast their JSON to SlidePlan without parsing it, so a
   * plan that never went through the schema — one stored before the cap existed, or edited
   * in the wizard — reaches the renderer with its fourth node intact. Production shipped
   * exactly that: the note fix was live and the flow still drew four.
   */
  it("caps a plan that never went through the schema", () => {
    const unparsed: any = {
      role: "point",
      counter: "04",
      eyebrow: "E",
      headline: "H",
      body: "B",
      mockup: {
        type: "flow",
        steps: [
          { label: "Next.js Webhook" },
          { label: "Redis Queue", focus: true },
          { label: "Worker Process" },
          { label: "n8n Trigger" },
        ],
      },
    };
    const html = renderSlide(unparsed, 1);
    expect((html.match(/class="node/g) ?? [])).toHaveLength(FLOW_MAX_STEPS);
    expect(html).toContain("Next.js Webhook");
    expect(html).toContain("n8n Trigger");
    expect(html).not.toContain("Worker Process");
  });

  it("renders one arrow per node after the first, and no orphan", () => {
    const parsed = slidePlanSchema.parse(
      planWith([{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }])
    );
    const html = renderSlide(parsed.slides[0], 1);
    expect((html.match(/class="arrow"/g) ?? [])).toHaveLength(FLOW_MAX_STEPS - 1);
    expect((html.match(/class="node/g) ?? [])).toHaveLength(FLOW_MAX_STEPS);
    // The dropped middle step must be gone from the markup, not merely unstyled.
    expect(html).not.toContain(">C<");
  });
});
