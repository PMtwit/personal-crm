import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { SEEDED_CONTACTS } from "./global-setup";
import { testDatabaseUrl } from "./test-database";

// Success criteria from specs/01-продуктовая-идея.md.
// Tests run in order and share the test database.
test.describe.configure({ mode: "serial" });

const NAME = "Фёдор Проверкин";
const NOTE = "Договорились созвониться в пятницу и обсудить поездку";

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

test("открыл → видно список всех контактов", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(
    page.getByText(`Всего ${SEEDED_CONTACTS} контактов`),
  ).toBeVisible();
  await expect(contactList(page).getByRole("link")).toHaveCount(
    SEEDED_CONTACTS,
  );
});

test("форма не теряет введённое при ошибке", async ({ page }) => {
  await page.goto("/contacts/new");

  await page.getByLabel("Почта").fill("не-почта");
  await page.getByLabel("Телефон").fill("+7 900 111-22-33");
  await page.getByRole("button", { name: "Добавить контакт" }).click();

  await expect(page.getByText("Укажите имя")).toBeVisible();
  await expect(page.getByText("Похоже, в адресе почты ошибка")).toBeVisible();
  await expect(page.getByLabel("Телефон")).toHaveValue("+7 900 111-22-33");
  await expect(page.getByLabel("Почта")).toHaveValue("не-почта");
  await expect(page).toHaveURL(/\/contacts\/new$/);
});

test("добавил контакт → нашёл по имени → дописал заметку → изменения сохранились", async ({
  page,
}) => {
  // Add a contact
  await page.goto("/");
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await page.getByLabel("Имя").fill(NAME);
  await page.getByLabel("Кто это").fill("Коллега из автотеста");
  await page.getByLabel("Откуда знакомы").fill("Познакомились в автотесте");
  await page.getByLabel("Телефон").fill("+7 900 123-45-67");
  await page.getByLabel("Почта").fill("fedor@example.com");
  await page.getByRole("button", { name: "Добавить контакт" }).click();

  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();

  // It appears in the list
  await page.getByRole("link", { name: "Все контакты" }).click();
  await expect(
    page.getByText(`Всего ${SEEDED_CONTACTS + 1} контакт`),
  ).toBeVisible();
  await expect(
    contactList(page).getByRole("link", { name: NAME }),
  ).toBeVisible();

  // Find by name: lower case and "е" instead of "ё" still match
  await page
    .getByRole("searchbox", { name: "Найти контакт по имени" })
    .fill("федор проверкин");
  await expect(
    page.getByText(`Найдено: 1 из ${SEEDED_CONTACTS + 1}`),
  ).toBeVisible();
  await expect(page).toHaveURL(/\?q=/);
  await contactList(page).getByRole("link", { name: NAME }).click();

  // Add a note after a conversation
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await page.getByLabel("Новая заметка").fill(NOTE);
  await page.getByRole("button", { name: "Добавить заметку" }).click();

  const notes = page.getByRole("list", { name: "Заметки о контакте" });
  await expect(notes.getByText(NOTE)).toBeVisible();
  await expect(page.getByLabel("Новая заметка")).toHaveValue("");

  // Changes are saved in the contact card
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await expect(page.getByText("Коллега из автотеста")).toBeVisible();
  await expect(page.getByText("Познакомились в автотесте")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+7 900 123-45-67" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "fedor@example.com" }),
  ).toBeVisible();
  await expect(notes.getByText(NOTE)).toBeVisible();
});

test("изменил контакт → карточка показывает новые данные", async ({ page }) => {
  await page.goto("/?q=Проверкин");
  await contactList(page).getByRole("link", { name: NAME }).click();
  await page.getByRole("link", { name: "Изменить" }).click();

  await expect(page.getByLabel("Имя")).toHaveValue(NAME);
  await page.getByLabel("Телефон").fill("+7 911 000-00-01");
  await page.getByRole("button", { name: "Сохранить" }).click();

  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(
    page.getByRole("link", { name: "+7 911 000-00-01" }),
  ).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();
});

test("открыл тот же адрес в другом браузере → те же контакты", async ({
  browser,
}) => {
  // A separate browser context shares no cookies or storage with the others:
  // whatever it sees comes from the server
  const otherBrowser = await browser.newContext();
  const page = await otherBrowser.newPage();

  await page.goto("/");
  await expect(
    page.getByText(`Всего ${SEEDED_CONTACTS + 1} контакт`),
  ).toBeVisible();
  await expect(contactList(page).getByRole("link")).toHaveCount(
    SEEDED_CONTACTS + 1,
  );

  await contactList(page).getByRole("link", { name: NAME }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+7 911 000-00-01" }),
  ).toBeVisible();

  await otherBrowser.close();
});

async function countNotes(contactId: number): Promise<number> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query<{ total: number }>(
      "select count(*)::int as total from notes where contact_id = $1",
      [contactId],
    );
    return result.rows[0].total;
  } finally {
    await client.end();
  }
}

test("удалил контакт → пропал из списка вместе с заметками", async ({
  page,
}) => {
  await page.goto("/?q=Проверкин");
  await contactList(page).getByRole("link", { name: NAME }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  const cardUrl = page.url();
  const contactId = Number(new URL(cardUrl).pathname.split("/").pop());
  expect(await countNotes(contactId)).toBe(1);

  // The button sits on the card, right under "Edit"
  const deleteButton = page.getByRole("button", {
    name: "Удалить",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: `Удалить «${NAME}»?` });

  // Cancel, Esc and a click outside close the dialog and delete nothing
  await deleteButton.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Заметки о контакте тоже удалятся"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();

  await deleteButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await deleteButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await expect(page).toHaveURL(cardUrl);

  // Delete: the list opens with a message, the contact is gone
  await deleteButton.click();
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click();

  await expect(page.getByText(`Контакт «${NAME}» удалён`)).toBeVisible();
  // The name is dropped from the address, so a reload does not repeat the message
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText(`Всего ${SEEDED_CONTACTS} контактов`),
  ).toBeVisible();
  await expect(contactList(page).getByRole("link", { name: NAME })).toHaveCount(
    0,
  );
  await expect(page.getByText(`Контакт «${NAME}» удалён`)).toBeHidden({
    timeout: 10_000,
  });

  await page.reload();
  await expect(
    page.getByText(`Всего ${SEEDED_CONTACTS} контактов`),
  ).toBeVisible();
  await expect(page.getByText(`Контакт «${NAME}» удалён`)).toHaveCount(0);

  // Search does not find it, the old card address is gone, the notes too
  await page
    .getByRole("searchbox", { name: "Найти контакт по имени" })
    .fill("Проверкин");
  await expect(
    page.getByText(`Никого не нашлось по запросу «Проверкин»`),
  ).toBeVisible();
  await page.goto(cardUrl);
  await expect(
    page.getByRole("heading", { name: "Такой страницы нет" }),
  ).toBeVisible();
  expect(await countNotes(contactId)).toBe(0);
});

test("несуществующий контакт → понятное сообщение", async ({ page }) => {
  await page.goto("/contacts/999999");
  await expect(
    page.getByRole("heading", { name: "Такой страницы нет" }),
  ).toBeVisible();
});
