import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth";
import { apiKeyMiddleware } from "./middleware/api-key";
import { availableModels } from "./lib/ai/registry";

// Import Route Handlers
import healthRoute from "./routes/health";
import briefRoute from "./routes/user/brief";
import planRoute from "./routes/user/plan";
import assembleRoute from "./routes/user/assemble";
import captureRoute from "./routes/user/capture";
import publishRoute from "./routes/user/publish";
import automationRoute from "./routes/automation/generate";

// ==========================================
// 1. User Application Server (Port 3000)
// ==========================================
const userApp = new Hono();

// CORS Middleware
userApp.use(
  "/api/*",
  cors({
    origin: (origin) => {
      const allowed = process.env.ALLOWED_ORIGIN;
      if (allowed && allowed.split(",").map(o => o.trim()).includes(origin)) {
        return origin;
      }
      // fallback in development
      if (process.env.NODE_ENV === "development") {
        return origin;
      }
      return allowed;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Health check endpoint (Public)
userApp.route("/", healthRoute);

// JWT Protected User Routes
userApp.use("/api/*", authMiddleware());
userApp.get("/api/models", (c) => c.json({ models: availableModels() }));
userApp.get("/api/publish/config", (c) => {
  return c.json({
    hasIg: Boolean(process.env.BUFFER_IG_CHANNEL_ID),
    hasTt: Boolean(process.env.BUFFER_TIKTOK_CHANNEL_ID),
  });
});
userApp.route("/api/brief", briefRoute);
userApp.route("/api/plan", planRoute);
userApp.route("/api/assemble", assembleRoute);
userApp.route("/api/capture", captureRoute);
userApp.route("/api/publish", publishRoute);

// Global Error Handler
userApp.onError((err, c) => {
  console.error("User Server Error:", err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

// ==========================================
// 2. Automation Application Server (Port 3001)
// ==========================================
const automationApp = new Hono();

// Health check endpoint on port 3001 too
automationApp.route("/", healthRoute);

// API Key Protected Internal Routes
automationApp.use("/automation/*", apiKeyMiddleware());
automationApp.route("/automation", automationRoute);

// Global Error Handler
automationApp.onError((err, c) => {
  console.error("Automation Server Error:", err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

// ==========================================
// 3. Serve Servers
// ==========================================
const userPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const autoPort = process.env.AUTOMATION_PORT ? parseInt(process.env.AUTOMATION_PORT, 10) : 3001;

serve({
  fetch: userApp.fetch,
  port: userPort,
});
console.log(`🚀 User API server started on port ${userPort}`);

serve({
  fetch: automationApp.fetch,
  port: autoPort,
});
console.log(`🔒 Automation API server started on port ${autoPort}`);
