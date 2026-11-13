import { defineConfig, devices } from "@playwright/test";
import { E2E_SUPABASE_URL } from "./e2e/support/mockBackend";

/**
 * Browser tests for the core flows (Plan Phase 4, R2). The app runs on its own Vite dev server
 * pointed at a fake Supabase address, and every request it makes is answered by
 * e2e/support/mockBackend.ts — nothing reaches the live database. See e2e/README.md.
 */
const PORT = 8091;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    // Desktop POS / Purchase layout (the phone layout is a different screen).
    viewport: { width: 1600, height: 900 },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Values already in the environment win over .env, so the app never even knows the live URL.
    env: {
      VITE_SUPABASE_URL: E2E_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-anon-key",
    },
  },
});
