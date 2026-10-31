import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { testDatabaseUrl } from "./test-database";

// "Keep in touch": the interval picker and the due date in the contact card.
// Every test creates its own contacts, named with PREFIX, and deletes them
// afterwards: main-scenario.spec.ts runs later and counts all contacts.
// Past dates of notes and of the interval choice are set by SQL straight
// into the test database.

const PREFIX = "Автотест связи";
const DAY_MS = 24 * 60 * 60 * 1000;

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

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

type TestInterval = "week" | "month" | "quarter" | "year";

// A contact of this test file. A note and the interval are optional;
// both dates are in the past: how many days ago
async function createContact(
  label: string,
  options: {
    interval?: { value: TestInterval; setDaysAgo: number };
    noteDaysAgo?: number[];
  } = {},
): Promise<number> {
  const { interval, noteDaysAgo = [] } = options;
  const [row] = await query<{ id: number }>(
    `insert into contacts (name, touch_interval, touch_interval_set_at)
     values ($1, $2, $3) returning id`,
    [
      `${PREFIX} ${label}`,
      interval?.value ?? null,
      interval ? daysAgo(interval.setDaysAgo) : null,
    ],
  );
  for (const days of noteDaysAgo) {
    await query(
      "insert into notes (contact_id, body, created_at) values ($1, $2, $3)",
      [row.id, "Старая заметка", daysAgo(days)],
    );
  }
  return row.id;
}

async function savedInterval(contactId: number) {
  const [row] = await query<{
    touch_interval: string | null;
    touch_interval_set_at: Date | null;
  }>(
    "select touch_interval, touch_interval_set_at from contacts where id = $1",
    [contactId],
  );
  return row;
}

// "15 ноября"; with a year ("15 ноября 2027") if it is not the current one
function dayMonth(date: Date): string {
  const text = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  return date.getFullYear() === new Date().getFullYear()
    ? text
    : `${text} ${date.getFullYear()}`;
}

function intervalGroup(page: Page) {
  return page.getByRole("group", { name: "Как часто общаться" });
}

function intervalRadio(page: Page, label: string) {
  return intervalGroup(page).getByRole("radio", { name: label });
}

// The pill is a label around a visually hidden radio: click what the user sees
async function chooseInterval(page: Page, label: string) {
  await intervalGroup(page).getByText(label, { exact: true }).click();
  await expect(intervalRadio(page, label)).toBeChecked();
}

test.afterEach(async () => {
  await query("delete from contacts where name like $1", [`${PREFIX}%`]);
});

test("новый контакт → в переключателе «Не задано», срока нет", async ({
  page,
}) => {
  const id = await createContact("без частоты");
  await page.goto(`/contacts/${id}`);

  await expect(intervalGroup(page).getByRole("radio")).toHaveCount(5);
  await expect(intervalRadio(page, "Не задано")).toBeChecked();
  await expect(page.getByText(/Связаться до|Пора связаться/)).toHaveCount(0);
});

test("выбрал «Раз в неделю» одним нажатием → сохранилось без кнопки и перехода", async ({
  page,
}) => {
  const id = await createContact("выбор одним нажатием");
  await page.goto(`/contacts/${id}`);
  const cardUrl = page.url();

  await chooseInterval(page, "Раз в неделю");

  // No page change and no "Save" button: the choice is saved by itself
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);
  const due = dayMonth(new Date(Date.now() + 7 * DAY_MS));
  await expect(page.getByText(`Связаться до ${due}`)).toBeVisible();
  // The page got the saved data, and the choice stays where it was
  await expect(intervalRadio(page, "Раз в неделю")).toBeChecked();

  await page.reload();
  await expect(intervalRadio(page, "Раз в неделю")).toBeChecked();
  await expect(page.getByText(`Связаться до ${due}`)).toBeVisible();
  expect((await savedInterval(id)).touch_interval).toBe("week");
});

test("выбрал «Раз в квартал» → тот же выбор виден в другом браузере", async ({
  page,
  browser,
}) => {
  const id = await createContact("другой браузер");
  await page.goto(`/contacts/${id}`);
  await chooseInterval(page, "Раз в квартал");
  await expect(page.getByText(/^Связаться до /)).toBeVisible();

  // A separate browser context shares no cookies or storage with the first one
  const otherBrowser = await browser.newContext();
  const otherPage = await otherBrowser.newPage();
  await otherPage.goto(`/contacts/${id}`);
  await expect(intervalRadio(otherPage, "Раз в квартал")).toBeChecked();
  await otherBrowser.close();
});

test("убрал частоту → в карточке нет срока", async ({ page }) => {
  const id = await createContact("убрать частоту", {
    interval: { value: "month", setDaysAgo: 2 },
  });
  await page.goto(`/contacts/${id}`);
  await expect(intervalRadio(page, "Раз в месяц")).toBeChecked();
  await expect(page.getByText(/^Связаться до /)).toBeVisible();

  await chooseInterval(page, "Не задано");

  await expect(page.getByText(/Связаться до|Пора связаться/)).toHaveCount(0);
  await page.reload();
  await expect(intervalRadio(page, "Не задано")).toBeChecked();
  const saved = await savedInterval(id);
  expect(saved.touch_interval).toBeNull();
  expect(saved.touch_interval_set_at).toBeNull();
});

test("срок считается от последней заметки", async ({ page }) => {
  // The interval was set long ago, the last note is 3 days old (and one older)
  const id = await createContact("срок по заметке", {
    interval: { value: "week", setDaysAgo: 30 },
    noteDaysAgo: [20, 3],
  });
  await page.goto(`/contacts/${id}`);

  const due = dayMonth(new Date(Date.now() + 4 * DAY_MS));
  await expect(page.getByText(`Связаться до ${due}`)).toBeVisible();
});

test("новая заметка запускает отсчёт заново", async ({ page }) => {
  const id = await createContact("новая заметка", {
    interval: { value: "week", setDaysAgo: 30 },
    noteDaysAgo: [10],
  });
  await page.goto(`/contacts/${id}`);
  await expect(
    page.getByText("Пора связаться: просрочено на 3 дня"),
  ).toBeVisible();

  await page.getByLabel("Новая заметка").fill("Созвонились");
  await page.getByRole("button", { name: "Добавить заметку" }).click();

  const due = dayMonth(new Date(Date.now() + 7 * DAY_MS));
  await expect(page.getByText(`Связаться до ${due}`)).toBeVisible();
  await expect(page.getByText(/Пора связаться/)).toHaveCount(0);
});

test("сменил частоту у контакта со старыми заметками → просрочка сразу", async ({
  page,
}) => {
  const id = await createContact("старые заметки", { noteDaysAgo: [20] });
  await page.goto(`/contacts/${id}`);
  await expect(page.getByText(/Связаться до|Пора связаться/)).toHaveCount(0);

  await chooseInterval(page, "Раз в неделю");

  // 20 days since the note, minus a week: overdue by 13 days. The choice itself
  // did not restart the countdown: the note counts, not the moment of choosing
  await expect(
    page.getByText("Пора связаться: просрочено на 13 дней"),
  ).toBeVisible();
});

test("без заметок срок идёт от выбора частоты и начинается заново при смене", async ({
  page,
}) => {
  // "Once a year" was chosen 19 days ago, there are no notes
  const id = await createContact("без заметок", {
    interval: { value: "year", setDaysAgo: 19 },
  });
  await page.goto(`/contacts/${id}`);
  await expect(page.getByText(/^Связаться до /)).toBeVisible();
  await expect(page.getByText(/Пора связаться/)).toHaveCount(0);

  // Changed to "once a week": counted from now, not from 19 days ago
  // (otherwise it would already be overdue)
  await chooseInterval(page, "Раз в неделю");

  const due = dayMonth(new Date(Date.now() + 7 * DAY_MS));
  await expect(page.getByText(`Связаться до ${due}`)).toBeVisible();
  await expect(page.getByText(/Пора связаться/)).toHaveCount(0);
});

test("контакт удалён в другой вкладке → «Контакт не найден», ничего не сохранено", async ({
  page,
}) => {
  const id = await createContact("удалён в другой вкладке");
  await page.goto(`/contacts/${id}`);
  await expect(intervalRadio(page, "Не задано")).toBeChecked();

  // Another tab deletes the contact
  await query("delete from contacts where id = $1", [id]);

  await intervalGroup(page).getByText("Раз в месяц", { exact: true }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Контакт не найден" }),
  ).toBeVisible();
  // Nothing was saved, and the pill shows what is really stored
  await expect(intervalRadio(page, "Не задано")).toBeChecked();
  expect(
    await query("select 1 from contacts where id = $1", [id]),
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// The "Time to get in touch" block on the home page
// ---------------------------------------------------------------------------

const BLOCK_NAME = "Пора связаться";

function dueBlock(page: Page) {
  return page.getByRole("region", { name: BLOCK_NAME });
}

function dueRows(page: Page) {
  return dueBlock(page)
    .getByRole("list", { name: "Кому пора написать или позвонить" })
    .getByRole("listitem");
}

function dueNames(page: Page) {
  return dueRows(page).getByRole("link");
}

// The number next to the block's heading
function dueCount(page: Page) {
  return dueBlock(page).locator("h2 + span");
}

function fullName(label: string) {
  return `${PREFIX} ${label}`;
}

// A contact "once a week" whose due date passed exactly overdueDays days ago:
// the last note is a week and overdueDays days old
async function createOverdue(
  label: string,
  overdueDays: number,
): Promise<number> {
  return createContact(label, {
    interval: { value: "week", setDaysAgo: 400 },
    noteDaysAgo: [overdueDays + 7],
  });
}

async function countNotes(contactId: number): Promise<number> {
  const [row] = await query<{ total: number }>(
    "select count(*)::int as total from notes where contact_id = $1",
    [contactId],
  );
  return row.total;
}

test("нет просроченных → блока на главной нет", async ({ page }) => {
  // The interval is set, but the due date is still ahead: nobody to show
  await createContact("срок впереди", {
    interval: { value: "month", setDaysAgo: 2 },
  });
  await createContact("без частоты");

  await page.goto("/");

  await expect(page.getByText(/^Всего \d+ контакт/)).toBeVisible();
  await expect(page.getByRole("heading", { name: BLOCK_NAME })).toHaveCount(0);
});

test("самые просроченные сверху, контакт со сроком впереди не в блоке", async ({
  page,
}) => {
  await createOverdue("Борис", 3);
  await createOverdue("Анна", 40);
  await createOverdue("Вера", 10);
  await createContact("Григорий впереди", {
    interval: { value: "month", setDaysAgo: 2 },
  });
  await createContact("Дарья без частоты");

  await page.goto("/");

  await expect(dueCount(page)).toHaveText("3");
  await expect(dueNames(page)).toHaveText([
    fullName("Анна"),
    fullName("Вера"),
    fullName("Борис"),
  ]);
});

test("одинаковый срок → по имени", async ({ page }) => {
  const same = daysAgo(20);
  for (const label of ["Яна", "Алла"]) {
    const id = await createContact(label, {
      interval: { value: "week", setDaysAgo: 400 },
    });
    await query(
      "insert into notes (contact_id, body, created_at) values ($1, 'x', $2)",
      [id, same],
    );
  }

  await page.goto("/");

  await expect(dueNames(page)).toHaveText([fullName("Алла"), fullName("Яна")]);
});

test("в строке видны частота и просрочка", async ({ page }) => {
  await createOverdue("Анна", 15);
  // The due date came an hour ago: less than a day
  await createContact("Борис", {
    interval: { value: "week", setDaysAgo: 400 },
    noteDaysAgo: [7 + 1 / 24],
  });

  await page.goto("/");

  const anna = dueRows(page).filter({ hasText: fullName("Анна") });
  await expect(anna).toContainText("Раз в неделю");
  await expect(anna).toContainText("просрочено на 15 дней");
  const boris = dueRows(page).filter({ hasText: fullName("Борис") });
  await expect(boris).toContainText("срок подошёл");
});

test("нажал на строку, не на кнопку → открылась карточка", async ({ page }) => {
  const id = await createOverdue("Анна", 5);
  await page.goto("/");

  // By the name
  await dueNames(page)
    .filter({ hasText: fullName("Анна") })
    .click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: fullName("Анна") }),
  ).toBeVisible();

  // By the interval's text in the second line: the link is stretched over the row.
  // A mouse click by coordinates, as a person does it
  await page.goto("/");
  const row = dueRows(page).filter({ hasText: fullName("Анна") });
  const box = await row.getByText("Раз в неделю").boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
});

test("новая заметка в карточке → контакт ушёл из блока", async ({ page }) => {
  const id = await createOverdue("Анна", 5);
  await createOverdue("Борис", 4);
  await page.goto("/");
  await expect(dueNames(page)).toHaveCount(2);

  await page.goto(`/contacts/${id}`);
  await page.getByLabel("Новая заметка").fill("Созвонились");
  await page.getByRole("button", { name: "Добавить заметку" }).click();
  await expect(page.getByText("Созвонились")).toBeVisible();

  await page.goto("/");
  await expect(dueNames(page)).toHaveText([fullName("Борис")]);
});

test("убрал частоту в карточке → контакта нет в блоке", async ({ page }) => {
  const id = await createOverdue("Анна", 5);
  await createOverdue("Борис", 4);
  await page.goto(`/contacts/${id}`);

  await chooseInterval(page, "Не задано");
  await expect(page.getByText(/Связаться до|Пора связаться/)).toHaveCount(0);

  await page.goto("/");
  await expect(dueNames(page)).toHaveText([fullName("Борис")]);
});

test("удалил контакт из блока → его там больше нет", async ({ page }) => {
  const id = await createOverdue("Анна", 5);
  await createOverdue("Борис", 4);
  await page.goto("/");
  await dueNames(page)
    .filter({ hasText: fullName("Анна") })
    .click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));

  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("dialog", { name: `Удалить «${fullName("Анна")}»?` })
    .getByRole("button", { name: "Удалить", exact: true })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(dueNames(page)).toHaveText([fullName("Борис")]);
});

test("просроченных 12 → видно пять, «Показать всех (12)» раскрывает и сворачивает", async ({
  page,
}) => {
  for (let i = 1; i <= 12; i++) {
    await createOverdue(String(i).padStart(2, "0"), 20 + i);
  }
  await page.goto("/");

  await expect(dueCount(page)).toHaveText("12");
  await expect(dueRows(page)).toHaveCount(5);
  // The most overdue go first: 12, 11, ...
  await expect(dueNames(page).first()).toHaveText(fullName("12"));
  await dueBlock(page)
    .getByRole("button", { name: "Показать всех (12)" })
    .click();

  await expect(dueRows(page)).toHaveCount(12);
  await expect(
    dueBlock(page).getByRole("button", { name: "Свернуть" }),
  ).toBeVisible();
  await dueBlock(page).getByRole("button", { name: "Свернуть" }).click();

  await expect(dueRows(page)).toHaveCount(5);
  await expect(
    dueBlock(page).getByRole("button", { name: "Показать всех (12)" }),
  ).toBeVisible();
});

test("просроченных три → видно всех, кнопки «Показать всех» нет", async ({
  page,
}) => {
  for (const [label, days] of [
    ["Анна", 30],
    ["Борис", 20],
    ["Вера", 10],
  ] as const) {
    await createOverdue(label, days);
  }
  await page.goto("/");

  await expect(dueRows(page)).toHaveCount(3);
  await expect(
    dueBlock(page).getByRole("button", { name: /Показать всех|Свернуть/ }),
  ).toHaveCount(0);
});

test("поиск скрывает блок, очистка запроса возвращает", async ({ page }) => {
  await createOverdue("Анна", 5);
  await page.goto("/");
  await expect(dueBlock(page)).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Найти контакт по имени",
  });
  await search.fill("Автотест");
  await expect(page).toHaveURL(/\?q=/);
  await expect(page.getByText(/^Найдено: /)).toBeVisible();
  await expect(page.getByRole("heading", { name: BLOCK_NAME })).toHaveCount(0);

  await search.fill("");
  await expect(page).not.toHaveURL(/\?q=/);
  await expect(dueBlock(page)).toBeVisible();
});

// ---------------------------------------------------------------------------
// The "Already talked" button and the note dialog
// ---------------------------------------------------------------------------

function markButton(page: Page, label: string) {
  return page.getByRole("button", { name: `Уже связался: ${fullName(label)}` });
}

function noteDialog(page: Page) {
  return page.getByRole("dialog", { name: "Новая заметка" });
}

test("на телефоне кнопка «Уже», на компьютере «Уже связался»", async ({
  page,
}) => {
  await createOverdue("Анна", 5);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  // The visible text, as the person sees it: buttons are in capital letters by CSS
  await expect(markButton(page, "Анна")).toHaveText(/^Уже$/i, {
    useInnerText: true,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(markButton(page, "Анна")).toHaveText(/^Уже связался$/i, {
    useInnerText: true,
  });
});

for (const [device, width] of [
  ["телефоне", 375],
  ["компьютере", 1280],
] as const) {
  test(`на ${device} кнопка не выше строки имени, строка не выше обычной`, async ({
    page,
  }) => {
    await createOverdue("Анна", 5);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const button = (await markButton(page, "Анна").boundingBox())!;
    const name = (await dueNames(page).first().boundingBox())!;
    const row = (await dueRows(page).first().boundingBox())!;
    const listRow = (await page
      .getByRole("region", { name: "Список контактов" })
      .getByRole("link")
      .first()
      .boundingBox())!;

    expect(button.height).toBeLessThanOrEqual(name.height);
    expect(row.height).toBeLessThanOrEqual(listRow.height + 1);
  });
}

test("длинное имя на телефоне → одна строка с многоточием, кнопка видна целиком", async ({
  page,
}) => {
  const longName = "Екатерина Александровна Морозова-Константинопольская";
  await createOverdue(longName, 5);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");

  const name = dueNames(page).first();
  const nameBox = (await name.boundingBox())!;
  // One line (24px) and the text does not fit into it: the end is cut off
  expect(nameBox.height).toBeLessThanOrEqual(24);
  expect(
    await name.evaluate((link) => link.scrollWidth > link.clientWidth),
  ).toBe(true);
  expect(
    await name.evaluate((link) => getComputedStyle(link).textOverflow),
  ).toBe("ellipsis");

  const button = markButton(page, longName);
  await expect(button).toBeVisible();
  const buttonBox = (await button.boundingBox())!;
  expect(buttonBox.x).toBeGreaterThanOrEqual(0);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test("нажал «Уже» → окно с именем и «Связался», заметок не прибавилось, карточка не открылась", async ({
  page,
}) => {
  const id = await createOverdue("Мария Кузнецова", 5);
  await page.goto("/");

  await markButton(page, "Мария Кузнецова").click();

  const dialog = noteDialog(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(`${fullName("Мария Кузнецова")}.`),
  ).toBeVisible();
  const field = dialog.getByRole("textbox", { name: "Текст заметки" });
  await expect(field).toHaveValue("Связался");
  // The cursor is in the field, after the text
  await expect(field).toBeFocused();
  expect(
    await field.evaluate(
      (textarea: HTMLTextAreaElement) =>
        textarea.selectionStart === textarea.value.length &&
        textarea.selectionEnd === textarea.value.length,
    ),
  ).toBe(true);
  // The button opened the dialog, not the card; nothing is written yet
  await expect(page).toHaveURL(/\/$/);
  expect(await countNotes(id)).toBe(1);
});

test("«Сохранить» сразу → окно закрылось, контакт ушёл из блока, в карточке «Связался»", async ({
  page,
}) => {
  const id = await createOverdue("Пётр", 15);
  await createOverdue("Мария", 20);
  await page.goto("/");
  await expect(dueCount(page)).toHaveText("2");

  await markButton(page, "Пётр").click();
  await noteDialog(page).getByRole("button", { name: "Сохранить" }).click();

  await expect(noteDialog(page)).toBeHidden();
  await expect(dueNames(page)).toHaveText([fullName("Мария")]);
  await expect(dueCount(page)).toHaveText("1");
  await expect(page).toHaveURL(/\/$/);

  // In the card the note is on top, and the due date is a week from it
  await page.goto(`/contacts/${id}`);
  const notes = page.getByRole("list", { name: "Заметки о контакте" });
  await expect(notes.getByRole("listitem").first()).toContainText("Связался");
  await expect(
    page.getByText(
      `Связаться до ${dayMonth(new Date(Date.now() + 7 * DAY_MS))}`,
    ),
  ).toBeVisible();
});

test("дописал текст → в заметке всё, что написано", async ({ page }) => {
  const id = await createOverdue("Пётр", 15);
  await page.goto("/");

  await markButton(page, "Пётр").click();
  // The cursor is already after "Связался"
  await page.keyboard.type(", договорились встретиться в субботу");
  await noteDialog(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(noteDialog(page)).toBeHidden();

  await page.goto(`/contacts/${id}`);
  await expect(
    page.getByText("Связался, договорились встретиться в субботу"),
  ).toBeVisible();
});

test("⌘/Ctrl + Enter сохраняет заметку", async ({ page }) => {
  const id = await createOverdue("Пётр", 15);
  await page.goto("/");

  await markButton(page, "Пётр").click();
  await noteDialog(page).getByRole("textbox").press("Control+Enter");

  await expect(noteDialog(page)).toBeHidden();
  await expect(dueRows(page)).toHaveCount(0);
  expect(await countNotes(id)).toBe(2);
});

test("«Отмена», Esc и нажатие мимо окна → заметки нет, контакт на месте", async ({
  page,
}) => {
  const id = await createOverdue("Пётр", 15);
  await page.goto("/");
  const dialog = noteDialog(page);

  await markButton(page, "Пётр").click();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();

  await markButton(page, "Пётр").click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await markButton(page, "Пётр").click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  await expect(dueNames(page)).toHaveText([fullName("Пётр")]);
  await expect(page).toHaveURL(/\/$/);
  expect(await countNotes(id)).toBe(1);
});

test("пустое поле → «Заметка пустая», окно открыто; при следующем открытии снова «Связался»", async ({
  page,
}) => {
  const id = await createOverdue("Пётр", 15);
  await page.goto("/");
  const dialog = noteDialog(page);

  await markButton(page, "Пётр").click();
  await dialog.getByRole("textbox").fill("");
  await dialog.getByRole("button", { name: "Сохранить" }).click();

  await expect(dialog.getByText("Заметка пустая")).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(await countNotes(id)).toBe(1);

  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();
  await markButton(page, "Пётр").click();
  await expect(dialog.getByRole("textbox")).toHaveValue("Связался");
  await expect(dialog.getByText("Заметка пустая")).toHaveCount(0);
});

test("освободилось место в первой пятёрке → снова видно пять, «Показать всех (11)»", async ({
  page,
}) => {
  for (let i = 1; i <= 12; i++) {
    await createOverdue(String(i).padStart(2, "0"), 20 + i);
  }
  await page.goto("/");
  await expect(dueRows(page)).toHaveCount(5);

  // "12" is the most overdue: the first in the block
  await markButton(page, "12").click();
  await noteDialog(page).getByRole("button", { name: "Сохранить" }).click();
  await expect(noteDialog(page)).toBeHidden();

  await expect(dueRows(page)).toHaveCount(5);
  await expect(dueNames(page).first()).toHaveText(fullName("11"));
  await expect(
    dueBlock(page).getByRole("button", { name: "Показать всех (11)" }),
  ).toBeVisible();
  await expect(dueCount(page)).toHaveText("11");
});

test("отметил последнего → блока на главной больше нет", async ({ page }) => {
  await createOverdue("Пётр", 15);
  await page.goto("/");

  await markButton(page, "Пётр").click();
  await noteDialog(page).getByRole("button", { name: "Сохранить" }).click();

  await expect(page.getByRole("heading", { name: BLOCK_NAME })).toHaveCount(0);
  await expect(page.getByText(/^Всего \d+ контакт/)).toBeVisible();
});

test("двойное нажатие «Сохранить» → одна заметка", async ({ page }) => {
  const id = await createOverdue("Пётр", 15);
  await page.goto("/");

  await markButton(page, "Пётр").click();
  await noteDialog(page)
    .getByRole("button", { name: "Сохранить" })
    .dblclick({ delay: 0 });
  await expect(noteDialog(page)).toBeHidden();
  await expect(dueRows(page)).toHaveCount(0);

  // The old note and one new
  expect(await countNotes(id)).toBe(2);
});

test("контакт удалён в другой вкладке → в окне «Контакт не найден», заметки нет", async ({
  page,
}) => {
  const id = await createOverdue("Пётр", 15);
  await page.goto("/");

  await markButton(page, "Пётр").click();
  await query("delete from contacts where id = $1", [id]);
  await noteDialog(page).getByRole("button", { name: "Сохранить" }).click();

  await expect(noteDialog(page).getByText("Контакт не найден")).toBeVisible();
  await expect(noteDialog(page)).toBeVisible();
  expect(await countNotes(id)).toBe(0);
});
