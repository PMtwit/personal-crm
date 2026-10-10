import { defineConfig } from "@playwright/test";

import { testDatabaseUrl } from "./e2e/test-database";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one database, so they run one after another
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The Google Chrome installed on this computer, no extra download
    channel: "chrome",
    locale: "ru-RU",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT} --hostname 127.0.0.1`,
    // A page without database queries: the server starts before
    // global setup has created the test database
    url: `http://127.0.0.1:${PORT}/contacts/new`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      E2E_SERVER: "1",
    },
  },
});
