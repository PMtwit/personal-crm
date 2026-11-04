import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { testDatabaseUrl } from "./test-database";

// Groups: the pills in the contact card, a new group from the card, and renaming
// and deleting on the "Groups" page.
// Every test creates its own contacts (named with PREFIX) and groups by SQL
// and deletes them afterwards: the other spec files run later, expect no
// groups and count all contacts.

const PREFIX = "Автотест групп";
const TOO_LONG_NAME = "Д".repeat(51);
const TEST_GROUPS = [
  "Дача",
  "Дача в Лесном",
  "Друзья",
  "Семья",
  "Черновик",
  TOO_LONG_NAME,
];
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

async function createContact(label: string): Promise<number> {
  const [row] = await query<{ id: number }>(
    "insert into contacts (name) values ($1) returning id",
    [fullName(label)],
  );
  return row.id;
}

async function createGroup(name: string): Promise<number> {
  const [row] = await query<{ id: number }>(
    "insert into groups (name) values ($1) returning id",
    [name],
  );
  return row.id;
}

async function addToGroup(contactId: number, groupId: number) {
  await query(
    "insert into contact_groups (contact_id, group_id) values ($1, $2)",
    [contactId, groupId],
  );
}

// The contact's groups as saved in the database. A pill changes before the
// server answers, so its look proves nothing: only this shows that it was saved
async function savedGroups(contactId: number): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `select g.name from contact_groups cg
     join groups g on g.id = cg.group_id
     where cg.contact_id = $1
     order by g.name collate "ru-x-icu"`,
    [contactId],
  );
  return rows.map((row) => row.name);
}

async function allGroups(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `select name from groups order by name collate "ru-x-icu"`,
  );
  return rows.map((row) => row.name);
}

function cardPills(page: Page) {
  return page.getByRole("group", { name: "Группы", exact: true });
}

// The pill is a label around a visually hidden checkbox: click what the user sees
async function clickPill(page: Page, name: string) {
  await cardPills(page).getByText(name, { exact: true }).click();
}

// The list on the home page has this one contact and nobody else
async function expectOnlyInList(page: Page, label: string) {
  await expect(contactList(page).getByRole("link")).toHaveCount(1);
  await expect(
    contactList(page).getByRole("link", { name: fullName(label) }),
  ).toBeVisible();
}

async function openNewGroupDialog(page: Page) {
  await page.getByRole("button", { name: "Новая группа" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая группа" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.afterEach(async () => {
  await query("delete from contacts where name like $1", [`${PREFIX}%`]);
  await query("delete from groups where name = any($1)", [TEST_GROUPS]);
});

// ---------------------------------------------------------------------------
// A click on a group pill in the contact card
// ---------------------------------------------------------------------------

test("нажал «Семья» в карточке → выделена, сохранилось без кнопки и перехода", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await createGroup("Дача");
  await createGroup("Семья");
  await page.goto(`/contacts/${anna}`);
  const cardUrl = page.url();
  await expectCardGroups(page, [
    ["Дача", false],
    ["Семья", false],
  ]);

  await clickPill(page, "Семья");

  await expect.poll(() => savedGroups(anna)).toEqual(["Семья"]);
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);
  await expectCardGroups(page, [
    ["Дача", false],
    ["Семья", true],
  ]);

  await page.reload();
  await expectCardGroups(page, [
    ["Дача", false],
    ["Семья", true],
  ]);
});

test("нажал «Друзья», потом «Дача» → выделены обе, контакт виден при каждом фильтре", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await createGroup("Дача");
  await createGroup("Друзья");
  await createGroup("Семья");
  await page.goto(`/contacts/${anna}`);

  // One right after the other, without waiting for the first to be saved
  await clickPill(page, "Друзья");
  await clickPill(page, "Дача");

  await expect.poll(() => savedGroups(anna)).toEqual(["Дача", "Друзья"]);
  await page.reload();
  await expectCardGroups(page, [
    ["Дача", true],
    ["Друзья", true],
    ["Семья", false],
  ]);

  await page.goto("/");
  for (const name of ["Друзья", "Дача"]) {
    await groupFilter(page).getByRole("link", { name, exact: true }).click();
    await expect(page.getByText(`В группе «${name}» 1 контакт`)).toBeVisible();
    await expectOnlyInList(page, "Анна");
  }
});

test("нажал выделенную «Семья» → контакт вышел из неё, из других групп не вышел", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  const boris = await createContact("Борис");
  const dacha = await createGroup("Дача");
  const family = await createGroup("Семья");
  await addToGroup(anna, dacha);
  await addToGroup(anna, family);
  await addToGroup(boris, family);
  await page.goto(`/contacts/${anna}`);
  await expectCardGroups(page, [
    ["Дача", true],
    ["Семья", true],
  ]);

  await clickPill(page, "Семья");

  await expect.poll(() => savedGroups(anna)).toEqual(["Дача"]);
  await page.reload();
  await expectCardGroups(page, [
    ["Дача", true],
    ["Семья", false],
  ]);

  // Anna is out of the filter's list, Boris stays
  await page.goto("/");
  await groupFilter(page).getByRole("link", { name: "Семья" }).click();
  await expect(page.getByText("В группе «Семья» 1 контакт")).toBeVisible();
  await expectOnlyInList(page, "Борис");
});

test("отметил «Друзья» → тот же выбор виден в другом браузере", async ({
  page,
  browser,
}) => {
  const anna = await createContact("Анна");
  await createGroup("Друзья");
  await page.goto(`/contacts/${anna}`);

  await clickPill(page, "Друзья");
  await expect.poll(() => savedGroups(anna)).toEqual(["Друзья"]);

  // A separate browser context shares no cookies or storage with the first one
  const otherBrowser = await browser.newContext();
  const otherPage = await otherBrowser.newPage();
  await otherPage.goto(`/contacts/${anna}`);
  await expectCardGroups(otherPage, [["Друзья", true]]);
  await otherBrowser.close();
});

test("контакт удалён в другой вкладке, нажал таблетку → «Контакт не найден», ничего не сохранено", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await createGroup("Семья");
  await page.goto(`/contacts/${anna}`);
  await expectCardGroups(page, [["Семья", false]]);

  // Another tab deletes the contact
  await query("delete from contacts where id = $1", [anna]);

  await clickPill(page, "Семья");

  await expect(
    page.getByRole("alert").filter({ hasText: "Контакт не найден" }),
  ).toBeVisible();
  // The pill shows what is really saved: nothing
  await expectCardGroups(page, [["Семья", false]]);
  expect(await savedGroups(anna)).toEqual([]);
});

test("группа удалена в другой вкладке, нажал её таблетку → «Группа не найдена», таблетки больше нет", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await createGroup("Дача");
  const family = await createGroup("Семья");
  await page.goto(`/contacts/${anna}`);
  await expectCardGroups(page, [
    ["Дача", false],
    ["Семья", false],
  ]);

  // Another tab deletes the group
  await query("delete from groups where id = $1", [family]);

  await clickPill(page, "Семья");

  await expect(
    page.getByRole("alert").filter({ hasText: "Группа не найдена" }),
  ).toBeVisible();
  await expectCardGroups(page, [["Дача", false]]);
  expect(await savedGroups(anna)).toEqual([]);
});

// ---------------------------------------------------------------------------
// A new group from the contact card
// ---------------------------------------------------------------------------

test("групп ещё нет → в карточке «Групп пока нет» и кнопка «Новая группа»", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await page.goto(`/contacts/${anna}`);

  await expect(page.getByText("Групп пока нет")).toBeVisible();
  await expect(cardPills(page).getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Новая группа" }),
  ).toBeVisible();
});

test("создал «Дачу» → окно закрылось, таблетка выделена, у других контактов не выделена, в фильтре есть", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  const boris = await createContact("Борис");
  await page.goto(`/contacts/${anna}`);

  const dialog = await openNewGroupDialog(page);
  await expect(
    dialog.getByText(`${fullName("Анна")} сразу войдёт в неё.`),
  ).toBeVisible();
  await dialog.getByLabel("Название").fill("Дача");
  await dialog.getByRole("button", { name: "Создать" }).click();

  await expect(dialog).toBeHidden();
  await expectCardGroups(page, [["Дача", true]]);
  await expect(page.getByText("Групп пока нет")).toHaveCount(0);
  expect(await savedGroups(anna)).toEqual(["Дача"]);

  await page.reload();
  await expectCardGroups(page, [["Дача", true]]);

  await page.goto(`/contacts/${boris}`);
  await expectCardGroups(page, [["Дача", false]]);

  await page.goto("/");
  await groupFilter(page).getByRole("link", { name: "Дача" }).click();
  await expect(page.getByText("В группе «Дача» 1 контакт")).toBeVisible();
  await expectOnlyInList(page, "Анна");
});

test("ввёл название и закрыл окно: «Отмена», Esc, мимо окна → группа не создана", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await page.goto(`/contacts/${anna}`);

  let dialog = await openNewGroupDialog(page);
  await dialog.getByLabel("Название").fill("Черновик");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();

  // Every time the dialog opens, the field is empty
  dialog = await openNewGroupDialog(page);
  await expect(dialog.getByLabel("Название")).toHaveValue("");
  await dialog.getByLabel("Название").fill("Черновик");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  dialog = await openNewGroupDialog(page);
  await dialog.getByLabel("Название").fill("Черновик");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  expect(await allGroups()).toEqual([]);
  expect(await savedGroups(anna)).toEqual([]);
  await expect(page.getByText("Групп пока нет")).toBeVisible();
});

test("двойное нажатие «Создать» → одна группа, контакт в ней один раз", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await page.goto(`/contacts/${anna}`);

  const dialog = await openNewGroupDialog(page);
  await dialog.getByLabel("Название").fill("Дача");
  await dialog.getByRole("button", { name: "Создать" }).dblclick({ delay: 0 });

  await expect(dialog).toBeHidden();
  await expectCardGroups(page, [["Дача", true]]);
  expect(await allGroups()).toEqual(["Дача"]);
  expect(await savedGroups(anna)).toEqual(["Дача"]);
});

test("создал группу с занятым названием «семья» → новой нет, контакт в существующей «Семье»", async ({
  page,
}) => {
  const boris = await createContact("Борис");
  await createGroup("Семья");
  await page.goto(`/contacts/${boris}`);
  await expectCardGroups(page, [["Семья", false]]);

  const dialog = await openNewGroupDialog(page);
  await dialog.getByLabel("Название").fill("семья");
  await dialog.getByRole("button", { name: "Создать" }).click();

  await expect(dialog).toBeHidden();
  await expectCardGroups(page, [["Семья", true]]);
  expect(await allGroups()).toEqual(["Семья"]);
  expect(await savedGroups(boris)).toEqual(["Семья"]);
});

test("пустое и слишком длинное название → ошибка под полем, окно открыто; исправил → создана без пробелов по краям", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await page.goto(`/contacts/${anna}`);
  const dialog = await openNewGroupDialog(page);
  const field = dialog.getByLabel("Название");
  const create = dialog.getByRole("button", { name: "Создать" });

  await create.click();
  await expect(dialog.getByText("Укажите название")).toBeVisible();

  await field.fill("   ");
  await create.click();
  await expect(dialog.getByText("Укажите название")).toBeVisible();

  await field.fill(TOO_LONG_NAME);
  await create.click();
  await expect(
    dialog.getByText("Слишком длинно: не больше 50 символов"),
  ).toBeVisible();

  await expect(dialog).toBeVisible();
  expect(await allGroups()).toEqual([]);

  await field.fill("  Дача  ");
  await create.click();

  await expect(dialog).toBeHidden();
  await expectCardGroups(page, [["Дача", true]]);
  expect(await allGroups()).toEqual(["Дача"]);
});

test("контакт удалён в другой вкладке, создаю группу → в окне «Контакт не найден», группа не создана", async ({
  page,
}) => {
  const anna = await createContact("Анна");
  await page.goto(`/contacts/${anna}`);
  const dialog = await openNewGroupDialog(page);

  // Another tab deletes the contact
  await query("delete from contacts where id = $1", [anna]);

  await dialog.getByLabel("Название").fill("Дача");
  await dialog.getByRole("button", { name: "Создать" }).click();

  await expect(dialog.getByText("Контакт не найден")).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(await allGroups()).toEqual([]);
});

// ---------------------------------------------------------------------------
// The "Groups" page
// ---------------------------------------------------------------------------

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
