import { betterAuth } from "better-auth";
import { dialect } from "./db";

// Public signup is OFF at runtime; the seed script sets ALLOW_SIGNUP=true.
const allowSignup = process.env.ALLOW_SIGNUP === "true";

export const auth = betterAuth({
  database: { dialect, type: "sqlite" },
  // Under Vitest, quiet better-auth to error-level so expected warn logs
  // (missing base URL, deliberate invalid-password test paths) don't pollute
  // test output. Runtime keeps the default warn level.
  ...(process.env.VITEST ? { logger: { level: "error" as const } } : {}),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !allowSignup,
    minPasswordLength: 8,
  },
});
