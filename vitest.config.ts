import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // The suites moved here from the web app, where "@" resolved to the repo root
  // and lib/ sat directly under it. Pointing the alias at src/ keeps their
  // "@/lib/..." imports working unchanged.
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
  },
});
