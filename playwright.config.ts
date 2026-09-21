import { defineConfig, devices } from "@playwright/test";

// Not 3000: that port is often held by something else locally. The app needs
// the database up (docker compose up -d) for the scores to come back.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  // Every test waits on a real pgRouting query; a slow one takes 2 s.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
