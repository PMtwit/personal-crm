import { expect, type Page } from "@playwright/test";

import { loginLink, waitForLetter } from "./mailpit";

// Where the owner's login is kept between the tests: the setup project logs
// in once and saves the browser state here; the other tests start with it
export const OWNER_STATE = "e2e/.auth/owner.json";

// Asks for a link on the login page, as a person does. Returns the moment
// just before the request: the letter is looked up by it
export async function requestLoginLink(
  page: Page,
  email: string,
): Promise<Date> {
  const since = new Date();
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(
    page.getByText(`Ссылка для входа отправлена на ${email.toLowerCase()}`),
  ).toBeVisible();
  return since;
}

// The whole way in: the form, the letter in Mailpit, the link from it.
// Ends on the home page, logged in
export async function logInThroughLetter(
  page: Page,
  email: string,
): Promise<void> {
  const since = await requestLoginLink(page, email);
  const letter = await waitForLetter(email.toLowerCase(), since);
  await page.goto(loginLink(letter));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
}
