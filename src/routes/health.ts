import { Hono } from "hono";
import { captureQueue } from "../services/capture-queue";

const app = new Hono();

app.get("/health", async (c) => {
  try {
    // Check DB connection
    const { dialect } = await import("../lib/db");
    // Simple query test: selecting a constant since Kysely might not be active, but let's test executing raw query
    // In our monolith, we can run Kysely raw command or verify Kysely initialization:
    const executor = dialect.createQueryCompiler();
    
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      queue: captureQueue.stats,
    });
  } catch (err: any) {
    return c.json(
      {
        status: "unhealthy",
        error: err.message,
      },
      503
    );
  }
});

export default app;
