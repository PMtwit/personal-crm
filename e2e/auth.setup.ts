import { test as setup } from "@playwright/test";

import { logInThroughLetter, OWNER_STATE } from "./auth";
import { TEST_OWNER_EMAIL } from "./test-database";

// Logs in the test owner once, through the form and the letter in Mailpit, and
// keeps the browser state for the other tests
setup("вход владельца", async ({ page }) => {
  await logInThroughLetter(page, TEST_OWNER_EMAIL);
  await page.context().storageState({ path: OWNER_STATE });
});
