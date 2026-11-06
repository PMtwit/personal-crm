import { randomBytes } from "node:crypto";

import { defineConfig } from "@playwright/test";

import { OWNER_STATE } from "./e2e/auth";
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
  projects: [
    // Logs in the test owner once and keeps the browser state
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Everything but login runs as the logged-in owner
    {
      name: "app",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /login\.spec\.ts/],
      use: { storageState: OWNER_STATE },
    },
    // Login itself: starts with nobody logged in
    {
      name: "login",
      dependencies: ["setup"],
      testMatch: /login\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT} --hostname 127.0.0.1`,
    // A page without database queries: the server starts before
    // global setup has created the test database
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      E2E_SERVER: "1",
      // Login: the secret is the one from .env or CI, or a random one for this
      // run; the links in the letters point to this server; the letters go to
      // the local Mailpit (docker compose up)
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET || randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
      SMTP_URL: process.env.SMTP_URL || "smtp://127.0.0.1:1025",
      // UTC, whatever the computer: the app must show Moscow's time by itself,
      // and on a computer in Moscow a test could not tell the difference
      TZ: "UTC",
    },
  },
});
