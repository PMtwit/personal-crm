import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./e2e/test-database";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

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
    env: { DATABASE_URL: testDatabaseUrl("unit_test") },
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
