import { Hono } from "hono";
import { resolveModel, type ModelId } from "../../lib/ai/registry";
import { generateSlidePlan, reviseSlidePlanScoped, type MockupDiversityContext } from "../../lib/ai/generate";
import { describeScope, RevisionScopeViolation } from "../../lib/ai/revision-scope";
import { appendRevision, listRevisions } from "../../lib/memory/repo";
import { summarizePlanDiff } from "../../lib/memory/diff";
import type { SlidePlan } from "../../lib/ds/schema";
import { getUnderusedMockupTypes, getRecentMockupStatsWithPercentages, getGlobalMockupStats, getRecentLayoutStats } from "../../lib/history/repo";

const app = new Hono<{ Variables: { session: any } }>();

app.get("/mockup-stats", async (c) => {
  const session = c.get("session") as { user: { id: string } };
  const userId = session?.user?.id;

  const [globalStats, recentStats, layoutStats] = await Promise.all([
    getGlobalMockupStats(),
    userId ? getRecentMockupStatsWithPercentages(userId).catch(() => []) : Promise.resolve([]),
    userId ? getRecentLayoutStats(userId).catch(() => []) : Promise.resolve([]),
  ]);

  return c.json({ global: globalStats, recent: recentStats, layouts: layoutStats });
});

app.post("/", async (c) => {
  const session = c.get("session") as { user: { id: string } };
  const { brief, modelId } = await c.req.json() as { brief: string; modelId: ModelId };
  if (!brief?.trim()) {
    return c.json({ error: "Missing brief" }, 400);
  }
  const model = resolveModel(modelId);
  const userId = session?.user?.id;
  const [underused, stats] = await Promise.all([
    userId ? getUnderusedMockupTypes(userId).catch(() => []) : Promise.resolve([]),
    userId ? getRecentMockupStatsWithPercentages(userId).catch(() => []) : Promise.resolve([]),
  ]);
  const diversity: MockupDiversityContext = { underusedTypes: underused, stats };
  const plan = await generateSlidePlan(brief, model, diversity);
  return c.json({ plan });
});

app.post("/revise", async (c) => {
  const session = c.get("session") as { user: { id: string } };
  const { plan, message, modelId, draftId } = await c.req.json() as {
    plan: SlidePlan;
    message: string;
    modelId: ModelId;
    draftId?: string;
  };

  if (!plan || !message?.trim()) {
    return c.json({ error: "Missing plan or message" }, 400);
  }

  const model = resolveModel(modelId);
  const history = draftId ? await listRevisions(session.user.id, draftId, "plan") : [];

  let result;
  try {
    result = await reviseSlidePlanScoped(plan, message, model, history);
  } catch (err) {
    if (err instanceof RevisionScopeViolation) {
      console.error("[revision-guard] blocked an out-of-scope revision:", err.violations);
      return c.json(
        {
          error: `Revisi dibatalkan: perubahan menyentuh bagian yang tidak diminta (${err.violations.join("; ")}).`,
          violations: err.violations,
        },
        422
      );
    }
    throw err;
  }

  const { plan: revised, scope, changed } = result;

  if (scope.resolved && changed.length === 0) {
    return c.json(
      {
        error: `Revisi tidak menghasilkan perubahan apa pun pada ${describeScope(scope)}. Coba sebutkan lebih spesifik apa yang mau diubah.`,
        scope: describeScope(scope),
      },
      422
    );
  }

  if (draftId) {
    await appendRevision({
      userId: session.user.id,
      draftId,
      stage: "plan",
      request: message,
      outcome: `[${describeScope(scope)}] ${summarizePlanDiff(plan, revised)}`,
    });
  }

  return c.json({ plan: revised, scope: describeScope(scope), changed });
});

export default app;
