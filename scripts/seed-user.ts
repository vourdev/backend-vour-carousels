/**
 * Create the single operator account this service needs.
 *
 * Public signup is off at runtime (`disableSignUp: !allowSignup` in lib/auth.ts), which
 * left a clean deploy with no way to produce a user at all — and /automation/generate
 * refuses to run without one, answering "No user found in the database. Seed the database
 * first." with no seed to run. This is that seed.
 *
 *   npx tsx scripts/seed-user.ts --email you@example.com --password 'a-long-one'
 *
 * ALLOW_SIGNUP is forced on for this process only; the running server never sees it.
 * Existing users are left alone, so re-running is safe.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

function loadDotEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .env — rely on the real environment (this is how it runs in the container).
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

loadDotEnv();

const email = arg("email") ?? process.env.SEED_EMAIL;
const password = arg("password") ?? process.env.SEED_PASSWORD;
const name = arg("name") ?? process.env.SEED_NAME ?? "Vour Operator";

if (!email || !password) {
  console.error("Usage: tsx scripts/seed-user.ts --email <email> --password <password> [--name <name>]");
  console.error("       (or set SEED_EMAIL / SEED_PASSWORD)");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters (minPasswordLength in lib/auth.ts).");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Point it at the Turso database first.");
  process.exit(1);
}
// better-auth throws in production without these, and this script IS the production path.
process.env.BETTER_AUTH_SECRET ??= process.env.AUTOMATION_SECRET;
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
if (!process.env.BETTER_AUTH_SECRET) {
  console.error("BETTER_AUTH_SECRET is not set (and no AUTOMATION_SECRET to borrow).");
  process.exit(1);
}

process.env.ALLOW_SIGNUP = "true";

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const existing = await db
  .execute("SELECT id, email FROM user LIMIT 5")
  .catch(() => ({ rows: [] as Record<string, unknown>[] }));

if (existing.rows.length > 0) {
  console.log(`Database already has ${existing.rows.length} user(s):`);
  for (const r of existing.rows) console.log(`  ${r.id}  ${r.email ?? "(no email)"}`);
  console.log("Nothing to do. Delete a row by hand if you really want to re-seed.");
  process.exit(0);
}

// Imported after ALLOW_SIGNUP is set: lib/auth.ts reads it at module scope.
const { auth } = await import("../src/lib/auth");

// better-auth does not create its own tables. On the Turso database in use they already
// exist (someone ran the CLI once, long ago), but on a genuinely fresh one sign-up dies
// with "no such table: user" — which is the failure this whole script exists to remove.
// getMigrations is the same thing `@better-auth/cli migrate` drives, so no extra
// dependency is needed and re-running is a no-op once the tables are there.
const { getMigrations } = await import("better-auth/db/migration");
const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(auth.options);
if (toBeCreated.length || toBeAdded.length) {
  console.log(
    `Applying auth schema: ${toBeCreated.length} table(s) to create, ${toBeAdded.length} to alter.`
  );
  await runMigrations();
} else {
  console.log("Auth schema already present.");
}

try {
  await auth.api.signUpEmail({ body: { email, password, name } });
} catch (err) {
  console.error("Sign-up failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

const created = await db.execute({ sql: "SELECT id FROM user WHERE email = ?", args: [email] });
if (!created.rows[0]) {
  console.error("Sign-up reported success but no user row exists. Check DATABASE_URL.");
  process.exit(1);
}
console.log(`Created user ${created.rows[0].id} for ${email}.`);
console.log("Automation can now resolve a userId. Signup stays disabled on the server.");
