import { Hono } from "hono";
import { resolveModel, type ModelId } from "../../lib/ai/registry";
import { generateBrief, polishBriefVoice } from "../../lib/ai/generate";
import { briefRevisionPrompt, scopedBriefRevisePrompt } from "../../lib/ai/prompts";
import { briefScopeViolations, briefTargets, mergeBriefSections, splitBrief } from "../../lib/ai/brief-sections";
import { parseRevisionScope } from "../../lib/ai/revision-scope";
import { appendRevision, listRevisions } from "../../lib/memory/repo";

const app = new Hono<{ Variables: { session: any } }>();

app.post("/", async (c) => {
  const { idea, modelId } = await c.req.json() as { idea: string; modelId: ModelId };
  if (!idea?.trim()) {
    return c.json({ error: "Missing idea" }, 400);
  }
  const model = resolveModel(modelId);
  const brief = await generateBrief(idea, model);
  return c.json({ brief });
});

app.post("/polish", async (c) => {
  const { brief, modelId } = await c.req.json() as { brief: string; modelId: ModelId };
  if (!brief?.trim()) {
    return c.json({ error: "Missing brief" }, 400);
  }
  const model = resolveModel(modelId);
  const polished = await polishBriefVoice(brief, model);
  return c.json({ brief: polished });
});

app.post("/revise", async (c) => {
  const session = c.get("session") as { user: { id: string } };
  const { brief, message, modelId, draftId } = await c.req.json() as {
    brief: string;
    message: string;
    modelId: ModelId;
    draftId?: string;
  };

  if (!brief?.trim() || !message?.trim()) {
    return c.json({ error: "Missing brief or message" }, 400);
  }

  const model = resolveModel(modelId);
  const history = draftId ? await listRevisions(session.user.id, draftId, "brief") : [];
  const sections = splitBrief(brief);
  const slideCount = sections.filter((s) => s.kind === "slide").length;
  const scope = parseRevisionScope(message, slideCount);
  const targets = scope.resolved ? briefTargets(sections, scope) : [];

  let revised: string;
  let outcome: string;

  if (targets.length === 0) {
    revised = await generateBrief(briefRevisionPrompt(brief, message, history), model);
    outcome = `whole brief rewritten (${brief.length} to ${revised.length} chars)`;
  } else {
    const headings = targets.map((i) => sections[i].heading);
    const rewritten = await generateBrief(
      scopedBriefRevisePrompt(brief, headings, message, history),
      model
    );
    const merged = mergeBriefSections(sections, targets, rewritten);

    if (merged.applied.length === 0) {
      return c.json(
        { error: `Revisi dibatalkan: model tidak mengembalikan bagian yang diminta (${headings.join(", ")}).` },
        422
      );
    }

    const violations = briefScopeViolations(sections, merged.brief, merged.applied);
    if (violations.length) {
      return c.json(
        { error: `Revisi dibatalkan: perubahan menyentuh bagian yang tidak diminta (${violations.join("; ")}).` },
        422
      );
    }

    revised = merged.brief;
    outcome = `${merged.applied.map((i) => sections[i].heading).join(", ")} rewritten`;
    if (merged.missing.length) outcome += ` (not returned: ${merged.missing.join(", ")})`;
  }

  if (draftId) {
    await appendRevision({
      userId: session.user.id,
      draftId,
      stage: "brief",
      request: message,
      outcome,
    });
  }

  return c.json({ brief: revised });
});

export default app;
