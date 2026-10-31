import { expect, it } from "vitest";

// Fails on purpose: checks that main refuses a PR with red CI.
// The PR with this file is closed without merging
it("fails on purpose to check branch protection", () => {
  expect(1 + 1).toBe(3);
});
