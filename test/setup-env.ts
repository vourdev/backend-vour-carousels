// Runs in each test worker before any module loads. Sets a base URL only for
// the test environment so better-auth (lib/auth.ts, imported by many tests)
// does not emit its "Base URL is not set" warning — keeping test output
// pristine. Runtime behavior is unchanged: production reads BETTER_AUTH_URL
// from the real environment, and this fallback never applies there.
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
