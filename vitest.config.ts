import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./e2e/test-database";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "server-only": fromRoot("./test/server-only.ts"),
    },
  },
  test: {
    // Only unit tests next to the code: e2e/ belongs to Playwright
    include: ["src/**/*.test.ts"],
    // All tests share one database, so files run one after another
    fileParallelism: false,
    // A call counted in one test (for example revalidatePath) must not leak into the next
    clearMocks: true,
    // UTC, whatever the computer: the app must show Moscow's time by itself, and
    // on a computer in Moscow a test could not tell the difference
    env: {
      DATABASE_URL: testDatabaseUrl("unit_test"),
      TZ: "UTC",
      // Login in tests: the secret is the one from .env or CI, or a random one
      // for this run; the letters go to the local Mailpit (docker compose up)
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET || randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: "http://localhost:3000",
      SMTP_URL: process.env.SMTP_URL || "smtp://127.0.0.1:1025",
    },
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
