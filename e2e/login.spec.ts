import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import { logInThroughLetter, requestLoginLink } from "./auth";
import { lettersTo, loginLink, waitForLetter } from "./mailpit";
import { testDatabaseUrl } from "./test-database";

// Login and "everyone has their own data": success criteria from
// specs/02-пользователи-вход.md. These tests start with nobody logged in:
// every person gets their own browser context and their own email.
// The letters are read from Mailpit, the link from the letter is opened

const WITHOUT_LOGIN = { storageState: { cookies: [], origins: [] } };
test.use(WITHOUT_LOGIN);

function newEmail(name = "anna") {
  return `${name}-${randomUUID().slice(0, 8)}@example.com`;
}

// A person in their own browser: a context of its own, logged in by the letter
async function person(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInThroughLetter(page, email);
  return { context, page, email };
}

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

function header(page: Page) {
  return page.getByRole("banner");
}

// The home page shows the list of contacts
async function expectHome(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
}

async function expectLoginPage(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Почта")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Получить ссылку" }),
  ).toBeVisible();
}

// Adds a contact, as a person does; ends on its card
async function addContact(page: Page, name: string): Promise<string> {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  return page.url();
}

// Adds a contact with a note and creates a group for it, as a person does
async function addContactWithNoteAndGroup(
  page: Page,
  name: string,
  note: string,
  group: string,
): Promise<string> {
  const cardUrl = await addContact(page, name);
  await page.getByLabel("Новая заметка").fill(note);
  await page.getByRole("button", { name: "Добавить заметку" }).click();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole("button", { name: "Новая группа" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая группа" });
  await dialog.getByLabel("Название").fill(group);
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("checkbox", { name: group })).toBeChecked();
  return cardUrl;
}

test.describe("Без входа - только страница входа", () => {
  test("Открыл приложение без входа", async ({ page }) => {
    await page.goto("/");

    await expectLoginPage(page);
    await expect(page.getByText(/Всего \d+ контакт/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Фёдор" })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Список контактов" }),
    ).toHaveCount(0);
  });

  test("Открыл карточку по прямой ссылке без входа", async ({ page }) => {
    const [contact] = await sql<{ id: number; name: string }>(
      "select id, name from contacts order by id limit 1",
    );

    await page.goto(`/contacts/${contact.id}`);

    await expectLoginPage(page);
    await expect(page.getByText(contact.name)).toHaveCount(0);
  });

  test("Проверка выкатки работает без входа", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("Уже вошёл и открыл страницу входа", async ({ browser }) => {
    const { page, context } = await person(browser, newEmail());

    await page.goto("/login");

    await expectHome(page);
    await context.close();
  });
});

test.describe("Запрос ссылки для входа", () => {
  test("Ввёл почту", async ({ page }) => {
    const email = newEmail();

    const since = await requestLoginLink(page, email);

    const letter = await waitForLetter(email, since);
    expect(loginLink(letter)).toContain("/api/auth/magic-link/verify");
    // The form stays: a link can be asked for again
    await expect(page.getByLabel("Почта")).toBeVisible();
  });

  test("Почта, под которой уже входили", async ({ browser, page }) => {
    const known = await person(browser, newEmail("known"));
    await known.context.close();

    await requestLoginLink(page, known.email);
    await expect(
      page.getByText(`Ссылка для входа отправлена на ${known.email}`),
    ).toBeVisible();
    // The same words for a new address
    const fresh = newEmail("fresh");
    await requestLoginLink(page, fresh);
    await expect(
      page.getByText(`Ссылка для входа отправлена на ${fresh}`),
    ).toBeVisible();
  });
});

test.describe("Почта без пробелов и без разницы в регистре", () => {
  test("Пробелы и большие буквы", async ({ page }) => {
    const email = newEmail();
    const since = new Date();
    await page.goto("/login");

    await page.getByLabel("Почта").fill(`  ${email.toUpperCase()} `);
    await page.getByRole("button", { name: "Получить ссылку" }).click();

    await expect(
      page.getByText(`Ссылка для входа отправлена на ${email}`),
    ).toBeVisible();
    expect((await waitForLetter(email, since)).to).toEqual([email]);
  });

  test("Тот же пользователь", async ({ browser }) => {
    const email = newEmail();
    const first = await person(browser, email);
    await addContact(first.page, "Контакт Анны");
    await first.context.close();

    // The second time the address is typed in capitals, with spaces
    const context = await browser.newContext();
    const page = await context.newPage();
    const since = await requestLoginLink(page, `  ${email.toUpperCase()}  `);
    await page.goto(loginLink(await waitForLetter(email, since)));

    await expectHome(page);
    await expect(
      page.getByRole("link", { name: "Контакт Анны" }),
    ).toBeVisible();
    expect(
      await sql("select id from users where email = $1", [email]),
    ).toHaveLength(1);
    await context.close();
  });
});

test.describe("Неверный адрес почты", () => {
  test("Неверный адрес в форме", async ({ page, request }) => {
    await page.goto("/login");

    await page.getByLabel("Почта").fill("anna@");
    await page.getByRole("button", { name: "Получить ссылку" }).click();

    await expect(page.getByText("Проверь адрес почты")).toBeVisible();
    await expect(page.getByLabel("Почта")).toHaveValue("anna@");
    expect(await lettersTo("anna@")).toHaveLength(0);

    // Straight to the library's own address, past the form: closed
    const email = newEmail();
    const response = await request.post("/api/auth/sign-in/magic-link", {
      data: { email, callbackURL: "/" },
    });
    expect(response.status()).toBe(404);
    expect(await lettersTo(email)).toHaveLength(0);
  });

  test("Пустое поле", async ({ page }) => {
    await page.goto("/login");
    const button = page.getByRole("button", { name: "Получить ссылку" });

    await button.click();
    await expect(page.getByText("Проверь адрес почты")).toBeVisible();

    await page.getByLabel("Почта").fill("     ");
    await button.click();
    await expect(page.getByText("Проверь адрес почты")).toBeVisible();
    await expect(page.getByText("Ссылка для входа отправлена")).toHaveCount(0);
  });
});

test.describe("Вход по ссылке", () => {
  test("Вход по ссылке", async ({ browser }) => {
    const email = newEmail();

    const { page, context } = await person(browser, email);

    await expectHome(page);
    await expect(header(page).getByText(email)).toBeVisible();
    await context.close();
  });

  test("Первый вход - регистрация", async ({ browser }) => {
    const email = newEmail("new");
    expect(
      await sql("select id from users where email = $1", [email]),
    ).toHaveLength(0);

    const { page, context } = await person(browser, email);

    // Straight into the app: no questions, no forms
    await expectHome(page);
    expect(
      await sql("select id from users where email = $1", [email]),
    ).toHaveLength(1);
    await context.close();
  });
});

test.describe("Ссылка одноразовая и работает 15 минут", () => {
  async function linkFor(page: Page, email: string): Promise<string> {
    const since = await requestLoginLink(page, email);
    return loginLink(await waitForLetter(email, since));
  }

  test("Открыл ссылку второй раз", async ({ browser, page }) => {
    const email = newEmail();
    const link = await linkFor(page, email);
    await page.goto(link);
    await expectHome(page);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(link);

    await expect(
      otherPage.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await expect(
      otherPage.getByRole("link", { name: "Получить новую ссылку" }),
    ).toBeVisible();
    // Nobody is logged in there
    await otherPage.goto("/");
    await expectLoginPage(otherPage);
    // And the first browser is
    await page.reload();
    await expectHome(page);
    await other.close();
  });

  test("Ссылке больше 15 минут", async ({ page }) => {
    const email = newEmail();
    const link = await linkFor(page, email);
    await sql(
      "update verifications set expires_at = now() - interval '1 minute' where value::jsonb ->> 'email' = $1",
      [email],
    );

    await page.goto(link);

    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await page.goto("/");
    await expectLoginPage(page);
  });

  test("Ссылке меньше 15 минут", async ({ page }) => {
    const email = newEmail();
    const link = await linkFor(page, email);
    // Asked 14 minutes ago: one minute left
    await sql(
      "update verifications set expires_at = now() + interval '1 minute' where value::jsonb ->> 'email' = $1",
      [email],
    );

    await page.goto(link);

    await expectHome(page);
  });

  test("Кнопка на страницу входа", async ({ page }) => {
    const email = newEmail();
    const link = await linkFor(page, email);
    await sql(
      "update verifications set expires_at = now() - interval '1 minute' where value::jsonb ->> 'email' = $1",
      [email],
    );
    await page.goto(link);

    await page.getByRole("link", { name: "Получить новую ссылку" }).click();

    await expectLoginPage(page);
  });
});

test.describe("Новая ссылка отменяет старые", () => {
  test("Запросил ссылку дважды", async ({ page }) => {
    const email = newEmail();
    const first = new Date();
    await requestLoginLink(page, email);
    const firstLink = loginLink(await waitForLetter(email, first));
    // Mailpit tells letters apart by the time: let the second one be later
    await page.waitForTimeout(1100);
    const second = new Date();
    await requestLoginLink(page, email);
    const secondLink = loginLink(await waitForLetter(email, second));

    await page.goto(firstLink);
    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await page.goto("/");
    await expectLoginPage(page);

    await page.goto(secondLink);
    await expectHome(page);
  });
});

test.describe("Не больше 3 писем на почту за 10 минут", () => {
  test("Четвёртый запрос", async ({ page }) => {
    const email = newEmail();
    const links: string[] = [];
    for (let i = 0; i < 3; i++) {
      const since = new Date();
      await page.goto("/login");
      await page.getByLabel("Почта").fill(email);
      await page.getByRole("button", { name: "Получить ссылку" }).click();
      await expect(page.getByText(`отправлена на ${email}`)).toBeVisible();
      links.push(loginLink(await waitForLetter(email, since)));
      await page.waitForTimeout(1100);
    }

    await page.goto("/login");
    await page.getByLabel("Почта").fill(email);
    await page.getByRole("button", { name: "Получить ссылку" }).click();

    await expect(
      page.getByText("Слишком часто, попробуй через несколько минут"),
    ).toBeVisible();
    expect(await lettersTo(email)).toHaveLength(3);
    // The last link works: the refused request did not cancel it
    await page.goto(links[2]);
    await expectHome(page);
  });
});

test.describe("Вход держится 30 дней с последнего захода", () => {
  // Moves the person's login into the past: it was last used this many days ago,
  // so it ends in 30 minus that
  async function lastUsedDaysAgo(email: string, days: number) {
    await sql(
      `update sessions set updated_at = now() - make_interval(days => $2),
         created_at = now() - make_interval(days => $2),
         expires_at = now() - make_interval(days => $2) + interval '30 days'
       where user_id = (select id from users where email = $1)`,
      [email, days],
    );
  }

  // The session of the person ends in about 30 days from now: it was prolonged
  async function expectProlonged(email: string) {
    await expect(async () => {
      const [row] = await sql<{ days: number }>(
        `select extract(epoch from (expires_at - now())) / 86400 as days
         from sessions where user_id = (select id from users where email = $1)`,
        [email],
      );
      expect(Number(row.days)).toBeGreaterThan(29);
    }).toPass();
  }

  test("Вернулся через 20 дней", async ({ browser }) => {
    const { page, context, email } = await person(browser, newEmail());
    await lastUsedDaysAgo(email, 20);

    await page.goto("/");

    await expectHome(page);
    await expectProlonged(email);
    await context.close();
  });

  test("Не заходил больше 30 дней", async ({ browser }) => {
    const { page, context, email } = await person(browser, newEmail());
    await lastUsedDaysAgo(email, 31);

    await page.goto("/");

    await expectLoginPage(page);
    await context.close();
  });

  test("Заходил каждые 20 дней", async ({ browser }) => {
    const { page, context, email } = await person(browser, newEmail());
    await lastUsedDaysAgo(email, 20);
    await page.goto("/");
    await expectHome(page);
    await expectProlonged(email);

    // Another 20 days: 40 since the login, but only 20 since the last visit
    await lastUsedDaysAgo(email, 20);
    await page.goto("/");

    await expectHome(page);
    await context.close();
  });

  test("Два устройства", async ({ browser }) => {
    const email = newEmail();
    const computer = await person(browser, email);
    const phone = await person(browser, email);

    await computer.page.goto("/");
    await phone.page.goto("/");

    await expectHome(computer.page);
    await expectHome(phone.page);
    await computer.context.close();
    await phone.context.close();
  });
});

test.describe("Почта и «Выйти» в шапке", () => {
  test("Шапка после входа", async ({ browser }) => {
    const email = newEmail();
    const { page, context } = await person(browser, email);

    for (const path of ["/", "/groups", "/contacts/new"]) {
      await page.goto(path);
      await expect(header(page).getByText(email)).toBeVisible();
      await expect(
        header(page).getByRole("button", { name: "Выйти" }),
      ).toBeVisible();
    }
    await context.close();
  });

  test("Шапка на странице входа", async ({ page }) => {
    await page.goto("/login");

    await expectLoginPage(page);
    await expect(
      header(page).getByRole("button", { name: "Выйти" }),
    ).toHaveCount(0);
    await expect(header(page).getByText("@")).toHaveCount(0);
  });
});

test.describe("Выход только на этом устройстве", () => {
  test("Вышел", async ({ browser }) => {
    const { page, context } = await person(browser, newEmail());
    await page.goto("/groups");
    await page.getByRole("link", { name: "Все контакты" }).click();
    await expectHome(page);
    const [contact] = await sql<{ id: number }>(
      "select id from contacts order by id limit 1",
    );

    await header(page).getByRole("button", { name: "Выйти" }).click();

    await expectLoginPage(page);
    await expect(
      header(page).getByRole("button", { name: "Выйти" }),
    ).toHaveCount(0);
    // "Back" does not lead to the contacts, a direct address to a card neither
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Контакты" })).toHaveCount(
      0,
    );
    await expect(page.getByText(/Всего \d+ контакт/)).toHaveCount(0);
    await page.goto(`/contacts/${contact.id}`);
    await expectLoginPage(page);
    await context.close();
  });

  test("Другое устройство не выходит", async ({ browser }) => {
    const email = newEmail();
    const computer = await person(browser, email);
    const phone = await person(browser, email);

    await header(computer.page).getByRole("button", { name: "Выйти" }).click();
    await expectLoginPage(computer.page);

    await phone.page.goto("/");
    await expectHome(phone.page);
    await computer.context.close();
    await phone.context.close();
  });
});

test.describe("Куда уходят письма", () => {
  test("Письма на компьютере и в автотестах", async ({ page }) => {
    // Any address: the letter lies in Mailpit, nothing goes outside
    const email = "someone@mail.elsewhere.test";
    const since = new Date();

    await requestLoginLink(page, email);

    const letter = await waitForLetter(email, since);
    await page.goto(loginLink(letter));
    await expectHome(page);
  });
});

// Each person sees only their own: the main scenario of the spec
test.describe("У каждого свои данные", () => {
  const FEDOR = "Фёдор Проверкин";

  test("Контакт A не виден B, чужая карточка и несуществующий контакт", async ({
    browser,
  }) => {
    const a = await person(browser, newEmail("a"));
    const cardUrl = await addContact(a.page, FEDOR);
    const editUrl = `${cardUrl}/edit`;

    const b = await person(browser, newEmail("b"));
    // B has a contact of their own, so that the search has something to look in
    await addContact(b.page, "Борис Обычный");
    // The list and the search of B do not have the contact of A
    await b.page.goto("/");
    await expect(b.page.getByRole("link", { name: FEDOR })).toHaveCount(0);
    await b.page
      .getByRole("searchbox", { name: "Найти контакт по имени" })
      .fill("Проверкин");
    await expect(
      b.page.getByText("Никого не нашлось по запросу «Проверкин»"),
    ).toBeVisible();

    // The card and the edit page of A: "not found", no data of A on the page
    for (const url of [cardUrl, editUrl]) {
      await b.page.goto(url);
      await expect(
        b.page.getByRole("heading", { name: "Контакт не найден" }),
      ).toBeVisible();
      await expect(b.page.getByText(FEDOR)).toHaveCount(0);
      await expect(b.page.getByLabel("Имя")).toHaveCount(0);
    }

    // A contact that nobody has: the same page
    await b.page.goto("/contacts/999999");
    await expect(
      b.page.getByRole("heading", { name: "Контакт не найден" }),
    ).toBeVisible();
    await expect(
      b.page.getByRole("link", { name: "К списку контактов" }),
    ).toBeVisible();
    await a.context.close();
    await b.context.close();
  });

  test("Два пользователя не видят данные друг друга", async ({ browser }) => {
    const a = await person(browser, newEmail("a"));
    const b = await person(browser, newEmail("b"));
    const mine = {
      a: { name: "Анна Пользователь-А", note: "Заметка А", group: "Группа А" },
      b: { name: "Борис Пользователь-Б", note: "Заметка Б", group: "Группа Б" },
    };
    const card = {
      a: await addContactWithNoteAndGroup(
        a.page,
        mine.a.name,
        mine.a.note,
        mine.a.group,
      ),
      b: await addContactWithNoteAndGroup(
        b.page,
        mine.b.name,
        mine.b.note,
        mine.b.group,
      ),
    };
    const [groupB] = await sql<{ id: number }>(
      "select id from groups where name = $1",
      [mine.b.group],
    );

    async function expectNothingOfTheOther(
      me: { page: Page },
      other: typeof mine.a,
      otherCard: string,
    ) {
      await me.page.goto("/");
      await expect(me.page.getByRole("link", { name: other.name })).toHaveCount(
        0,
      );
      await me.page
        .getByRole("searchbox", { name: "Найти контакт по имени" })
        .fill(other.name.split(" ")[0]);
      await expect(
        me.page.getByText(/Никого не нашлось по запросу/),
      ).toBeVisible();
      await expect(me.page.getByRole("link", { name: other.name })).toHaveCount(
        0,
      );
      for (const url of [otherCard, `${otherCard}/edit`]) {
        await me.page.goto(url);
        await expect(
          me.page.getByRole("heading", { name: "Контакт не найден" }),
        ).toBeVisible();
        await expect(me.page.getByText(other.name)).toHaveCount(0);
        await expect(me.page.getByText(other.note)).toHaveCount(0);
      }
      // The groups of the other: not in the filter, not on the "Группы" page
      await me.page.goto("/");
      await expect(
        me.page.getByRole("link", { name: other.group }),
      ).toHaveCount(0);
      await me.page.goto("/groups");
      await expect(me.page.getByText(other.group)).toHaveCount(0);
    }

    await expectNothingOfTheOther(a, mine.b, card.b);
    await expectNothingOfTheOther(b, mine.a, card.a);

    // A group of B in the address of A: "All" is chosen, all contacts of A are there
    await a.page.goto(`/?group=${groupB.id}`);
    await expect(a.page.getByRole("link", { name: mine.a.name })).toBeVisible();

    // Each of them sees their own contact, note and group again
    for (const [me, own] of [
      [a, mine.a],
      [b, mine.b],
    ] as const) {
      await me.page.goto("/");
      await expect(me.page.getByRole("link", { name: own.name })).toBeVisible();
      await expect(
        me.page.getByRole("link", { name: own.group }),
      ).toBeVisible();
      await me.page.getByRole("link", { name: own.name }).click();
      await expect(me.page.getByText(own.note)).toBeVisible();
    }
    await a.context.close();
    await b.context.close();
  });

  test("Первый вход", async ({ browser }) => {
    // The owner of the test data has 30 contacts; a new person has none
    const { page, context } = await person(browser, newEmail("new"));

    await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Добавь первый контакт" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Группы" })).toHaveCount(
      0,
    );
    await context.close();
  });
});
