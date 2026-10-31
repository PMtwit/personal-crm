import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { testDatabaseUrl } from "./test-database";

// The "Groups" page: renaming and deleting a group.
// Every test creates its own contacts (named with PREFIX) and groups by SQL
// and deletes them afterwards: the other spec files run later, expect no
// groups and count all contacts.

const PREFIX = "Автотест групп";
const TEST_GROUPS = ["Дача", "Дача в Лесном", "Семья"];
const ANNA_NOTE = "Договорились вместе поехать на дачу в субботу";
const BORIS_NOTE = "Обещал привезти рассаду";

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

// Anna is in "Дача" and "Семья", once a month, with a note.
// Boris is only in "Дача", without an interval, with a note
async function createDachaAndFamily() {
  const [anna] = await query<{ id: number }>(
    `insert into contacts (name, touch_interval, touch_interval_set_at)
     values ($1, 'month', now()) returning id`,
    [fullName("Анна")],
  );
  const [boris] = await query<{ id: number }>(
    "insert into contacts (name) values ($1) returning id",
    [fullName("Борис")],
  );
  await query(
    "insert into notes (contact_id, body) values ($1, $2), ($3, $4)",
    [anna.id, ANNA_NOTE, boris.id, BORIS_NOTE],
  );
  const [dacha] = await query<{ id: number }>(
    "insert into groups (name) values ('Дача') returning id",
  );
  const [family] = await query<{ id: number }>(
    "insert into groups (name) values ('Семья') returning id",
  );
  await query(
    `insert into contact_groups (contact_id, group_id)
     values ($1, $2), ($1, $3), ($4, $2)`,
    [anna.id, dacha.id, family.id, boris.id],
  );
  return { anna: anna.id, boris: boris.id };
}

function groupsList(page: Page) {
  return page.getByRole("list", { name: "Список групп" });
}

// A row of the "Groups" page: the name, how many contacts, the buttons
function groupRow(page: Page, name: string) {
  return groupsList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

// The row of pills under the search on the home page
function groupFilter(page: Page) {
  return page.getByRole("navigation", { name: "Группы" });
}

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

// The group pills in the contact card, in order: the name and whether it is chosen
async function expectCardGroups(
  page: Page,
  pills: [name: string, chosen: boolean][],
) {
  const boxes = page
    .getByRole("group", { name: "Группы", exact: true })
    .getByRole("checkbox");
  await expect(boxes).toHaveCount(pills.length);
  for (const [index, [name, chosen]] of pills.entries()) {
    await expect(boxes.nth(index)).toHaveAccessibleName(name);
    await expect(boxes.nth(index)).toBeChecked({ checked: chosen });
  }
}

test.afterEach(async () => {
  await query("delete from contacts where name like $1", [`${PREFIX}%`]);
  await query("delete from groups where name = any($1)", [TEST_GROUPS]);
});

test("переименовал «Дача» в «Дача в Лесном» → новое название на странице «Группы», в фильтре и в карточках, в группе те же контакты", async ({
  page,
}) => {
  const { anna, boris } = await createDachaAndFamily();
  await page.goto("/groups");
  await expect(groupRow(page, "Дача")).toContainText("2 контакта");

  await page.getByRole("button", { name: "Переименовать «Дача»" }).click();
  const dialog = page.getByRole("dialog", { name: "Переименовать группу" });
  const field = dialog.getByLabel("Название");
  await expect(field).toHaveValue("Дача");
  await field.fill("Дача в Лесном");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();

  // The "Groups" page: the new name with the same number of contacts,
  // the old name is gone. After a reload too: it is saved
  await expect(groupRow(page, "Дача в Лесном")).toContainText("2 контакта");
  await expect(groupRow(page, "Дача")).toHaveCount(0);
  await page.reload();
  await expect(groupsList(page).getByRole("listitem")).toHaveCount(2);
  await expect(groupRow(page, "Дача в Лесном")).toContainText("2 контакта");

  // The filter on the home page: the new name, and the same people in the group
  await page.goto("/");
  await expect(groupFilter(page).getByRole("link")).toHaveText([
    "Все",
    "Дача в Лесном",
    "Семья",
    "Настроить группы",
  ]);
  await groupFilter(page).getByRole("link", { name: "Дача в Лесном" }).click();
  await expect(page).toHaveURL(/\?group=\d+$/);
  await expect(
    page.getByText("В группе «Дача в Лесном» 2 контакта"),
  ).toBeVisible();
  await expect(contactList(page).getByRole("link")).toHaveCount(2);
  await expect(
    contactList(page).getByRole("link", { name: fullName("Анна") }),
  ).toBeVisible();
  await expect(
    contactList(page).getByRole("link", { name: fullName("Борис") }),
  ).toBeVisible();

  // The cards: the new name, the same groups chosen
  await page.goto(`/contacts/${anna}`);
  await expectCardGroups(page, [
    ["Дача в Лесном", true],
    ["Семья", true],
  ]);
  await page.goto(`/contacts/${boris}`);
  await expectCardGroups(page, [
    ["Дача в Лесном", true],
    ["Семья", false],
  ]);
});

test("удалил «Дачу» → её нет на странице «Группы», в фильтре и в карточках, контакты на месте с заметками, частотой и другими группами", async ({
  page,
}) => {
  const { anna, boris } = await createDachaAndFamily();
  await page.goto("/groups");

  await page.getByRole("button", { name: "Удалить «Дача»" }).click();
  const dialog = page.getByRole("dialog", { name: "Удалить группу «Дача»?" });
  await expect(
    dialog.getByText(
      "Контакты останутся, они только выйдут из группы. Вернуть группу будет нельзя.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog).toBeHidden();

  // The "Groups" page: only "Семья" is left. After a reload too
  await expect(groupRow(page, "Дача")).toHaveCount(0);
  await page.reload();
  await expect(groupsList(page).getByRole("listitem")).toHaveCount(1);
  await expect(groupRow(page, "Семья")).toContainText("1 контакт");

  // The filter on the home page: no "Дача"; Anna and Boris are in the list
  await page.goto("/");
  await expect(groupFilter(page).getByRole("link")).toHaveText([
    "Все",
    "Семья",
    "Настроить группы",
  ]);
  await expect(
    contactList(page).getByRole("link", { name: fullName("Анна") }),
  ).toBeVisible();
  await expect(
    contactList(page).getByRole("link", { name: fullName("Борис") }),
  ).toBeVisible();

  // The cards: no "Дача"; the notes, the interval and "Семья" are as they were
  const notes = page.getByRole("list", { name: "Заметки о контакте" });
  const interval = page.getByRole("group", { name: "Как часто общаться" });

  await page.goto(`/contacts/${anna}`);
  await expect(
    page.getByRole("heading", { level: 1, name: fullName("Анна") }),
  ).toBeVisible();
  await expectCardGroups(page, [["Семья", true]]);
  await expect(notes.getByText(ANNA_NOTE)).toBeVisible();
  await expect(
    interval.getByRole("radio", { name: "Раз в месяц" }),
  ).toBeChecked();

  await page.goto(`/contacts/${boris}`);
  await expect(
    page.getByRole("heading", { level: 1, name: fullName("Борис") }),
  ).toBeVisible();
  await expectCardGroups(page, [["Семья", false]]);
  await expect(notes.getByText(BORIS_NOTE)).toBeVisible();
  await expect(
    interval.getByRole("radio", { name: "Не задано" }),
  ).toBeChecked();
});
