import { defineConfig } from "vitest/config";

// The database tests need DATABASE_URL, which lives in .env.local like it
// does for next dev. The unit tests mock pg and never read it.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // A pgRouting traversal per database test; the default 5 s is tight.
    testTimeout: 30_000,
  },
});
