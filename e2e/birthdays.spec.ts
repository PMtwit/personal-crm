import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import { logInThroughLetter } from "./auth";
import { OWNER_ID_SQL, testDatabaseUrl } from "./test-database";

// Birthdays: the "Birth date" field of the contact form, the line in the card
// and the "Birthday soon" block on the home page.
// Every test creates its own contacts, named with PREFIX, and deletes them
// afterwards: main-scenario.spec.ts runs later and counts all contacts.
// Dates are counted from today by Moscow's calendar: the server's clock is
// not faked, so fixed dates (New Year, February 29, midnight) are left to Vitest

const PREFIX = "Автотест дней рождения";

async function query<Row extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as Row[];
  } finally {
    await client.end();
  }
}

function fullName(label: string) {
  return `${PREFIX} ${label}`;
}

type Birth = { day: number; month: number; year?: number | null };

// A contact of this test file, with a birth date or without one
async function createContact(label: string, birth?: Birth): Promise<number> {
  const [row] = await query<{ id: number }>(
    `insert into contacts (user_id, name, birth_day, birth_month, birth_year)
     values (${OWNER_ID_SQL}, $1, $2, $3, $4) returning id`,
    [
      fullName(label),
      birth?.day ?? null,
      birth?.month ?? null,
      birth?.year ?? null,
    ],
  );
  return row.id;
}

async function savedBirthDate(contactId: number) {
  const [row] = await query<{
    birth_day: number | null;
    birth_month: number | null;
    birth_year: number | null;
  }>("select birth_day, birth_month, birth_year from contacts where id = $1", [
    contactId,
  ]);
  return row;
}

// The second person of the ownership test: an email of its own for every run
const OTHER_USER_PREFIX = "birthdays-other-";

// Groups are named with PREFIX too: the other spec files expect no groups
test.afterEach(async () => {
  await query("delete from contacts where name like $1", [`${PREFIX}%`]);
  await query("delete from groups where name like $1", [`${PREFIX}%`]);
  await query("delete from users where email like $1", [
    `${OTHER_USER_PREFIX}%`,
  ]);
});

// ---------------------------------------------------------------------------
// Today by Moscow's calendar, and texts counted from it
// ---------------------------------------------------------------------------

const TIME_ZONE = "Europe/Moscow";
const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

type CalendarDay = { year: number; month: number; day: number };

function moscowToday(): CalendarDay {
  const [year, month, day] = new Date()
    .toLocaleDateString("en-CA", { timeZone: TIME_ZONE })
    .split("-")
    .map(Number);
  return { year, month, day };
}

// The day that is `days` days from today in Moscow (negative: before today)
function moscowDayIn(days: number): CalendarDay {
  const today = moscowToday();
  const date = new Date(
    Date.UTC(today.year, today.month - 1, today.day + days),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function dayMonthText(day: number, month: number): string {
  return `${day} ${MONTHS[month - 1]}`;
}

const pluralRules = new Intl.PluralRules("ru-RU");

function yearsText(count: number): string {
  const rule = pluralRules.select(count);
  const word = rule === "one" ? "год" : rule === "few" ? "года" : "лет";
  return `${count} ${word}`;
}

function daysText(count: number): string {
  const rule = pluralRules.select(count);
  const word = rule === "one" ? "день" : rule === "few" ? "дня" : "дней";
  return `${count} ${word}`;
}

// Full years today for someone born on this date
function ageToday(birth: Required<Birth> & { year: number }): number {
  const today = moscowToday();
  const hadBirthday =
    today.month > birth.month ||
    (today.month === birth.month && today.day >= birth.day);
  return today.year - birth.year - (hadBirthday ? 0 : 1);
}

// ---------------------------------------------------------------------------
// The form and the card
// ---------------------------------------------------------------------------

function dayPicker(page: Page) {
  return page.getByLabel("День", { exact: true });
}

function monthPicker(page: Page) {
  return page.getByLabel("Месяц", { exact: true });
}

function yearInput(page: Page) {
  return page.getByLabel("Год", { exact: true });
}

// The value next to "Дата рождения" in the card
function birthDateInCard(page: Page) {
  return page.locator('dt:text-is("Дата рождения") + dd');
}

// The error under "Дата рождения": shown, and read out with each of its fields
async function expectBirthDateError(page: Page, message: string) {
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  for (const field of [dayPicker(page), monthPicker(page), yearInput(page)]) {
    await expect(field).toHaveAccessibleDescription(new RegExp(message));
  }
}

async function fillBirthDate(
  page: Page,
  birth: { day: string; month: string; year: string },
) {
  await dayPicker(page).selectOption(birth.day);
  await monthPicker(page).selectOption({ label: birth.month });
  await yearInput(page).fill(birth.year);
}

async function addContact(
  page: Page,
  label: string,
  birth?: { day: string; month: string; year: string },
): Promise<number> {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(fullName(label));
  if (birth) {
    await fillBirthDate(page, birth);
  }
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  return Number(page.url().split("/").pop());
}

test("Добавил контакт с полной датой", async ({ page }) => {
  const id = await addContact(page, "Анна", {
    day: "15",
    month: "марта",
    year: "1990",
  });

  const age = ageToday({ day: 15, month: 3, year: 1990 });
  await expect(birthDateInCard(page)).toHaveText(
    `15 марта 1990, ${yearsText(age)}`,
  );
  expect(await savedBirthDate(id)).toEqual({
    birth_day: 15,
    birth_month: 3,
    birth_year: 1990,
  });
});

test("Дата без года", async ({ page }) => {
  await addContact(page, "Анна", { day: "15", month: "марта", year: "" });

  await expect(birthDateInCard(page)).toHaveText("15 марта");
});

test("Контакт без даты", async ({ page }) => {
  const id = await addContact(page, "Анна");

  await expect(birthDateInCard(page)).toHaveText("не указано");
  expect(await savedBirthDate(id)).toEqual({
    birth_day: null,
    birth_month: null,
    birth_year: null,
  });
});

test("Форма изменения показывает дату", async ({ page }) => {
  const id = await createContact("Анна", { day: 15, month: 3, year: 1990 });

  await page.goto(`/contacts/${id}/edit`);

  await expect(dayPicker(page)).toHaveValue("15");
  await expect(monthPicker(page)).toHaveValue("3");
  await expect(monthPicker(page).locator("option:checked")).toHaveText("марта");
  await expect(yearInput(page)).toHaveValue("1990");
});

test("Изменил дату", async ({ page, browser }) => {
  const id = await createContact("Анна", { day: 15, month: 3 });
  await page.goto(`/contacts/${id}/edit`);

  await dayPicker(page).selectOption("16");
  await page.getByRole("button", { name: "Сохранить" }).click();

  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
  await expect(birthDateInCard(page)).toHaveText("16 марта");
  await page.reload();
  await expect(birthDateInCard(page)).toHaveText("16 марта");

  // A separate browser context shares no cookies or storage with the first one
  const otherBrowser = await browser.newContext();
  const otherPage = await otherBrowser.newPage();
  await otherPage.goto(`/contacts/${id}`);
  await expect(birthDateInCard(otherPage)).toHaveText("16 марта");
  await otherBrowser.close();
});

test("Убрал дату", async ({ page }) => {
  const id = await createContact("Анна", { day: 15, month: 3, year: 1990 });
  await page.goto(`/contacts/${id}/edit`);

  await dayPicker(page).selectOption({ label: "День" });
  await monthPicker(page).selectOption({ label: "Месяц" });
  await yearInput(page).fill("");
  await page.getByRole("button", { name: "Сохранить" }).click();

  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
  await expect(birthDateInCard(page)).toHaveText("не указано");
  expect(await savedBirthDate(id)).toEqual({
    birth_day: null,
    birth_month: null,
    birth_year: null,
  });
});

test("Несуществующая дата", async ({ page }) => {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(fullName("Анна"));
  await fillBirthDate(page, { day: "31", month: "апреля", year: "" });
  await page.getByRole("button", { name: "Добавить контакт" }).click();

  await expectBirthDateError(page, "Такой даты нет");
  await expect(page).toHaveURL(/\/contacts\/new$/);
  const saved = await query("select id from contacts where name like $1", [
    `${PREFIX}%`,
  ]);
  expect(saved).toEqual([]);
});

test("Ошибка не стирает введённое", async ({ page }) => {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(fullName("Анна"));
  await page.getByLabel("Телефон").fill("+7 900 111-22-33");
  await fillBirthDate(page, { day: "31", month: "апреля", year: "" });
  await page.getByRole("button", { name: "Добавить контакт" }).click();

  await expectBirthDateError(page, "Такой даты нет");
  await expect(page.getByLabel("Имя")).toHaveValue(fullName("Анна"));
  await expect(page.getByLabel("Телефон")).toHaveValue("+7 900 111-22-33");
  await expect(dayPicker(page)).toHaveValue("31");
  await expect(monthPicker(page)).toHaveValue("4");

  // The same mistake again: the choice still stays
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expectBirthDateError(page, "Такой даты нет");
  await expect(dayPicker(page)).toHaveValue("31");
  await expect(monthPicker(page)).toHaveValue("4");
});

// ---------------------------------------------------------------------------
// The "Birthday soon" block on the home page
// ---------------------------------------------------------------------------

const BLOCK_NAME = "Скоро день рождения";

function birthdaysBlock(page: Page) {
  return page.getByRole("region", { name: BLOCK_NAME });
}

function birthdayRows(page: Page) {
  return birthdaysBlock(page)
    .getByRole("list", { name: "У кого скоро день рождения" })
    .getByRole("listitem");
}

function birthdayNames(page: Page) {
  return birthdayRows(page).getByRole("link");
}

function birthdayRow(page: Page, label: string) {
  return birthdayRows(page).filter({ hasText: fullName(label) });
}

// The number next to the block's heading
function birthdaysCount(page: Page) {
  return birthdaysBlock(page).locator("h2 + span");
}

function noBlock(page: Page) {
  return expect(page.getByRole("heading", { name: BLOCK_NAME })).toHaveCount(0);
}

// A contact whose birthday is `days` days from today in Moscow
async function createBirthdayIn(
  label: string,
  days: number,
  year: number | null = null,
): Promise<number> {
  const date = moscowDayIn(days);
  return createContact(label, { day: date.day, month: date.month, year });
}

// A contact "once a week" whose due date passed long ago: it is in
// "Time to get in touch"
async function createOverdue(label: string): Promise<number> {
  const [row] = await query<{ id: number }>(
    `insert into contacts (user_id, name, touch_interval, touch_interval_set_at)
     values (${OWNER_ID_SQL}, $1, 'week', now() - interval '400 days') returning id`,
    [fullName(label)],
  );
  return row.id;
}

async function createGroup(label: string, contactIds: number[]) {
  const [group] = await query<{ id: number }>(
    `insert into groups (user_id, name) values (${OWNER_ID_SQL}, $1) returning id`,
    [fullName(label)],
  );
  for (const contactId of contactIds) {
    await query(
      "insert into contact_groups (contact_id, group_id) values ($1, $2)",
      [contactId, group.id],
    );
  }
  return group.id;
}

function groupFilter(page: Page) {
  return page.getByRole("navigation", { name: "Группы" });
}

async function chooseGroup(page: Page, label: string) {
  await groupFilter(page)
    .getByRole("link", { name: fullName(label), exact: true })
    .click();
  await expect(page).toHaveURL(/\?group=/);
}

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: "Найти контакт по имени" });
}

test("Сегодня и через неделю", async ({ page }) => {
  await createBirthdayIn("Анна", 0);
  await createBirthdayIn("Борис", 7);
  await createBirthdayIn("Вера", 8);
  await createBirthdayIn("Глеб", -1);

  await page.goto("/");

  await expect(birthdaysCount(page)).toHaveText("2");
  await expect(birthdayNames(page)).toHaveText([
    fullName("Анна"),
    fullName("Борис"),
  ]);
});

test("Ближайшие сверху", async ({ page }) => {
  await createBirthdayIn("Анна", 5);
  await createBirthdayIn("Борис", 1);
  await createBirthdayIn("Вера", 0);

  await page.goto("/");

  await expect(birthdayNames(page)).toHaveText([
    fullName("Вера"),
    fullName("Борис"),
    fullName("Анна"),
  ]);
});

test("В один день - по имени", async ({ page }) => {
  await createBirthdayIn("Борис", 3);
  await createBirthdayIn("Анна", 3);

  await page.goto("/");

  await expect(birthdayNames(page)).toHaveText([
    fullName("Анна"),
    fullName("Борис"),
  ]);
});

test("Без года и с годом", async ({ page }) => {
  await createBirthdayIn("Анна", 3);
  await createBirthdayIn("Борис", 3, 1990);

  await page.goto("/");

  await expect(birthdayNames(page)).toHaveText([
    fullName("Анна"),
    fullName("Борис"),
  ]);
});

test("Когда", async ({ page }) => {
  await createBirthdayIn("Анна", 0);
  await createBirthdayIn("Борис", 1);
  await createBirthdayIn("Вера", 3);
  await createBirthdayIn("Глеб", 5);

  await page.goto("/");

  await expect(birthdayRow(page, "Анна")).toContainText("сегодня");
  await expect(birthdayRow(page, "Борис")).toContainText("завтра");
  await expect(birthdayRow(page, "Вера")).toContainText(`через ${daysText(3)}`);
  await expect(birthdayRow(page, "Глеб")).toContainText(`через ${daysText(5)}`);
});

test("Сколько исполнится", async ({ page }) => {
  await createBirthdayIn("Анна", 3, 1990);

  await page.goto("/");

  const date = moscowDayIn(3);
  const row = birthdayRow(page, "Анна");
  await expect(row).toContainText(dayMonthText(date.day, date.month));
  await expect(row).toContainText(`через ${daysText(3)}`);
  await expect(row).toContainText(`исполнится ${yearsText(date.year - 1990)}`);
});

test("Год не указан", async ({ page }) => {
  await createBirthdayIn("Борис", 3);

  await page.goto("/");

  const date = moscowDayIn(3);
  const row = birthdayRow(page, "Борис");
  await expect(row).toContainText(dayMonthText(date.day, date.month));
  await expect(row).toContainText(`через ${daysText(3)}`);
  await expect(row).not.toContainText("исполнится");
});

test("Длинное имя", async ({ page }) => {
  const longName = "Екатерина Александровна Морозова-Константинопольская";
  await createBirthdayIn(longName, 5, 1990);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");

  const name = birthdayNames(page).first();
  const nameBox = (await name.boundingBox())!;
  // One line (24px) and the text does not fit into it: the end is cut off
  expect(nameBox.height).toBeLessThanOrEqual(24);
  expect(
    await name.evaluate((link) => link.scrollWidth > link.clientWidth),
  ).toBe(true);
  expect(
    await name.evaluate((link) => getComputedStyle(link).textOverflow),
  ).toBe("ellipsis");

  // "через 5 дней" is whole and on the screen
  const when = birthdayRow(page, longName).getByText(`через ${daysText(5)}`, {
    exact: true,
  });
  await expect(when).toBeVisible();
  expect(await when.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const whenBox = (await when.boundingBox())!;
  expect(whenBox.x).toBeGreaterThanOrEqual(0);
  expect(whenBox.x + whenBox.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test("Вместе с «Пора связаться»", async ({ page }) => {
  await createOverdue("Пётр");
  await createBirthdayIn("Анна", 2);

  await page.goto("/");

  const due = page.getByRole("region", { name: "Пора связаться" });
  const list = page.getByRole("region", { name: "Список контактов" });
  await expect(due).toBeVisible();
  await expect(birthdaysBlock(page)).toBeVisible();
  const dueBox = (await due.boundingBox())!;
  const birthdaysBox = (await birthdaysBlock(page).boundingBox())!;
  const listBox = (await list.boundingBox())!;
  expect(birthdaysBox.y).toBeGreaterThanOrEqual(dueBox.y + dueBox.height);
  expect(listBox.y).toBeGreaterThanOrEqual(
    birthdaysBox.y + birthdaysBox.height,
  );
});

test("Открыл карточку из блока", async ({ page }) => {
  const id = await createBirthdayIn("Анна", 2);
  await page.goto("/");

  // By the name
  await birthdayNames(page)
    .filter({ hasText: fullName("Анна") })
    .click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: fullName("Анна") }),
  ).toBeVisible();

  // By the date in the second line: the link is stretched over the row.
  // A mouse click by coordinates, as a person does it
  await page.goto("/");
  const date = moscowDayIn(2);
  const box = (await birthdayRow(page, "Анна")
    .getByText(dayMonthText(date.day, date.month), { exact: true })
    .boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
});

test("Удалённый контакт", async ({ page }) => {
  const id = await createBirthdayIn("Анна", 2);
  await createBirthdayIn("Борис", 3);
  await page.goto("/");
  await birthdayNames(page)
    .filter({ hasText: fullName("Анна") })
    .click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));

  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("dialog", { name: `Удалить «${fullName("Анна")}»?` })
    .getByRole("button", { name: "Удалить", exact: true })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(birthdayNames(page)).toHaveText([fullName("Борис")]);
});

test("Убрал дату → контакта нет в блоке", async ({ page }) => {
  const id = await createBirthdayIn("Анна", 2, 1990);
  await createBirthdayIn("Борис", 3);
  await page.goto(`/contacts/${id}/edit`);

  await dayPicker(page).selectOption({ label: "День" });
  await monthPicker(page).selectOption({ label: "Месяц" });
  await yearInput(page).fill("");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(birthDateInCard(page)).toHaveText("не указано");

  await page.goto("/");
  await expect(birthdayNames(page)).toHaveText([fullName("Борис")]);
});

test("Именинников больше пяти, раскрыл и свернул", async ({ page }) => {
  for (let i = 1; i <= 8; i++) {
    await createBirthdayIn(String(i), i - 1);
  }
  await page.goto("/");

  // Именинников больше пяти
  await expect(birthdaysCount(page)).toHaveText("8");
  await expect(birthdayRows(page)).toHaveCount(5);
  await expect(birthdayNames(page)).toHaveText(
    ["1", "2", "3", "4", "5"].map(fullName),
  );

  // Раскрыл и свернул
  await birthdaysBlock(page)
    .getByRole("button", { name: "Показать всех (8)" })
    .click();
  await expect(birthdayRows(page)).toHaveCount(8);
  await birthdaysBlock(page).getByRole("button", { name: "Свернуть" }).click();
  await expect(birthdayRows(page)).toHaveCount(5);
  await expect(
    birthdaysBlock(page).getByRole("button", { name: "Показать всех (8)" }),
  ).toBeVisible();
});

test("Именинников не больше пяти", async ({ page }) => {
  await createBirthdayIn("Анна", 1);
  await createBirthdayIn("Борис", 2);
  await createBirthdayIn("Вера", 3);
  await page.goto("/");

  await expect(birthdayRows(page)).toHaveCount(3);
  await expect(
    birthdaysBlock(page).getByRole("button", {
      name: /Показать всех|Свернуть/,
    }),
  ).toHaveCount(0);
});

test("Поиск по имени", async ({ page }) => {
  await createBirthdayIn("Анна", 1);
  await page.goto("/");
  await expect(birthdaysBlock(page)).toBeVisible();

  await searchBox(page).fill("Автотест");
  await expect(page).toHaveURL(/\?q=/);
  await expect(page.getByText(/^Найдено: /)).toBeVisible();
  await noBlock(page);

  await searchBox(page).fill("");
  await expect(page).not.toHaveURL(/\?q=/);
  await expect(birthdaysBlock(page)).toBeVisible();
});

test("Поздравлять некого", async ({ page }) => {
  await createBirthdayIn("Анна", 8);
  await createBirthdayIn("Борис", -1, 1990);
  await createContact("Вера без даты");

  await page.goto("/");

  await expect(page.getByText(/^Всего \d+ контакт/)).toBeVisible();
  await noBlock(page);
});

// Anna and Vera are in "Семья", Boris in "Дача", Gleb in no group
async function familyAndDacha() {
  const anna = await createBirthdayIn("Анна", 1);
  const vera = await createBirthdayIn("Вера", 2);
  const boris = await createBirthdayIn("Борис", 3);
  await createBirthdayIn("Глеб", 4);
  await createGroup("Семья", [anna, vera]);
  await createGroup("Дача", [boris]);
}

test("Только выбранная группа", async ({ page }) => {
  await familyAndDacha();
  await page.goto("/");

  await chooseGroup(page, "Семья");

  await expect(birthdaysCount(page)).toHaveText("2");
  await expect(birthdayNames(page)).toHaveText([
    fullName("Анна"),
    fullName("Вера"),
  ]);
});

test("В группе поздравлять некого", async ({ page }) => {
  const anna = await createBirthdayIn("Анна", 1);
  const boris = await createBirthdayIn("Борис", 10);
  await createGroup("Семья", [anna]);
  await createGroup("Дача", [boris]);
  await page.goto("/");
  await expect(birthdaysBlock(page)).toBeVisible();

  await chooseGroup(page, "Дача");

  // The list already shows the group: only Boris
  const list = page.getByRole("region", { name: "Список контактов" });
  await expect(list.getByText(fullName("Борис"))).toBeVisible();
  await expect(list.getByText(fullName("Анна"))).toHaveCount(0);
  await noBlock(page);
});

test("Вернулся ко всем", async ({ page }) => {
  await familyAndDacha();
  await page.goto("/");
  await chooseGroup(page, "Семья");
  await expect(birthdayNames(page)).toHaveCount(2);

  await groupFilter(page)
    .getByRole("link", { name: "Все", exact: true })
    .click();

  await expect(page).not.toHaveURL(/\?group=/);
  await expect(birthdaysCount(page)).toHaveText("4");
  await expect(birthdayNames(page)).toHaveText(
    ["Анна", "Вера", "Борис", "Глеб"].map(fullName),
  );
});

test("Больше пяти в группе", async ({ page }) => {
  const family: number[] = [];
  for (let i = 1; i <= 6; i++) {
    family.push(await createBirthdayIn(`Семья ${i}`, i));
  }
  for (let i = 1; i <= 3; i++) {
    // The nearest of all are outside the group
    await createBirthdayIn(`Чужой ${i}`, 0);
  }
  await createGroup("Семья", family);
  await page.goto("/");
  await expect(birthdaysCount(page)).toHaveText("9");

  await chooseGroup(page, "Семья");

  await expect(birthdaysCount(page)).toHaveText("6");
  await expect(birthdayNames(page)).toHaveText(
    [1, 2, 3, 4, 5].map((i) => fullName(`Семья ${i}`)),
  );
  await expect(
    birthdaysBlock(page).getByRole("button", { name: "Показать всех (6)" }),
  ).toBeVisible();
});

test("Поиск при выбранной группе", async ({ page }) => {
  await familyAndDacha();
  await page.goto("/");
  await chooseGroup(page, "Семья");
  await expect(birthdaysBlock(page)).toBeVisible();

  await searchBox(page).fill("Автотест");
  await expect(page).toHaveURL(/\?.*q=/);
  await expect(page.getByText(/^Найдено: /)).toBeVisible();
  await noBlock(page);

  await searchBox(page).fill("");
  await expect(page).not.toHaveURL(/q=/);
  await expect(birthdayNames(page)).toHaveText([
    fullName("Анна"),
    fullName("Вера"),
  ]);
});

test("День рождения у контакта A", async ({ page, browser }) => {
  // A is the test owner: a contact with a birthday tomorrow
  await createBirthdayIn("Анна", 1);
  await page.goto("/");
  await expect(birthdaysBlock(page)).toBeVisible();

  // B logs in by a letter in a browser of their own, without A's login
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const other = await context.newPage();
  await logInThroughLetter(
    other,
    `${OTHER_USER_PREFIX}${randomUUID().slice(0, 8)}@example.com`,
  );

  await expect(other.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(other.getByRole("heading", { name: BLOCK_NAME })).toHaveCount(0);
  await context.close();
});
