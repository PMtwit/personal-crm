import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { signInEmails, users, verifications } from "@/db/schema";
import { requestSignInLink } from "@/lib/sign-in";

import { lettersTo, loginLink, waitForLetter } from "../../e2e/mailpit";
import { createUser, openLoginLink } from "../../test/helpers";

// Asking for a login link, with a real database and the real Mailpit
// (docker compose up -d --wait): the letters are read back from it.
// Every test uses its own address: Mailpit keeps the letters of other tests

function address(name = "anna") {
  return `${name}-${randomUUID().slice(0, 8)}@example.com`;
}

const headers = new Headers();

async function request(email: string) {
  return requestSignInLink(email, headers);
}

// The ready-made rows of "letters sent": as if the time had passed
async function sentLetters(email: string, minutesAgo: number, times: number) {
  for (let i = 0; i < times; i++) {
    await db.insert(signInEmails).values({
      email,
      createdAt: sql`now() - ${`${minutesAgo} minutes`}::interval`,
    });
  }
}

async function linkRows(email: string) {
  return db
    .select()
    .from(verifications)
    .where(sql`${verifications.value}::jsonb ->> 'email' = ${email}`);
}

describe("Запрос ссылки для входа", () => {
  it("Ввёл почту", async () => {
    const email = address();
    const before = new Date();

    expect(await request(email)).toEqual({ sentTo: email });

    const letter = await waitForLetter(email, before);
    expect(loginLink(letter)).toContain("/api/auth/magic-link/verify");
  });

  it("Почта, под которой уже входили", async () => {
    const known = address("known");
    const unknown = address("unknown");
    await createUser(known);

    // The answer does not tell whether such a person exists
    expect(await request(known)).toEqual({ sentTo: known });
    expect(await request(unknown)).toEqual({ sentTo: unknown });
    expect(await lettersTo(known)).toHaveLength(1);
    expect(await lettersTo(unknown)).toHaveLength(1);
  });

  it("Письмо не отправилось", async () => {
    const email = address();
    const before = new Date();
    expect(await request(email)).toEqual({ sentTo: email });
    const link = loginLink(await waitForLetter(email, before));
    const rowsBefore = await linkRows(email);
    const lettersBefore = await db.select().from(signInEmails);

    const working = process.env.SMTP_URL;
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    try {
      expect(await request(email)).toEqual({ error: "send-failed" });
    } finally {
      process.env.SMTP_URL = working;
    }

    // The failed try is not counted, and the link of the first letter lives
    expect(await db.select().from(signInEmails)).toEqual(lettersBefore);
    expect(await linkRows(email)).toEqual(rowsBefore);
    expect((await openLoginLink(link)).userId).not.toBeNull();
  });
});

describe("Почта без пробелов и без разницы в регистре", () => {
  it("Пробелы и большие буквы", async () => {
    const email = address();
    const before = new Date();

    const result = await request(`  ${email.toUpperCase()} `);

    expect(result).toEqual({ sentTo: email });
    const letter = await waitForLetter(email, before);
    expect(letter.to).toEqual([email]);
  });

  it("Тот же пользователь", async () => {
    const email = address();
    const existing = await createUser(email);
    const before = new Date();

    await request(email.toUpperCase());
    const opened = await openLoginLink(
      loginLink(await waitForLetter(email, before)),
    );

    expect(opened.userId).toBe(existing);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});

describe("Неверный адрес почты", () => {
  it.each(["", "   ", "не-почта", "anna@", "a b@example.com"])(
    "Неверный адрес прямым запросом к серверу: %j",
    async (wrong) => {
      expect(await request(wrong)).toEqual({ error: "invalid-email" });

      expect(await db.select().from(verifications)).toEqual([]);
      expect(await db.select().from(signInEmails)).toEqual([]);
    },
  );
});

describe("Письмо для входа", () => {
  it("Содержимое письма", async () => {
    const email = address();
    const before = new Date();
    await request(email);

    const letter = await waitForLetter(email, before);

    expect(letter.from).toEqual({
      name: "Личная CRM",
      address: "noreply@mail.crm.pmcrm.site",
    });
    expect(letter.subject).toBe("Вход в Личную CRM");
    const link = loginLink(letter);
    // The HTML has the "Войти" button, the text version has the same link
    expect(letter.html).toMatch(/>\s*Войти\s*</);
    expect(letter.text).toContain(link);
    for (const body of [letter.html, letter.text]) {
      expect(body).toContain("Ссылка работает 15 минут");
      expect(body).toContain(
        "Если вы не запрашивали вход - просто проигнорируйте письмо",
      );
    }
  });
});

describe("Ссылка одноразовая и работает 15 минут", () => {
  it("Срок ссылки - 15 минут от запроса", async () => {
    const email = address();
    await request(email);

    const [row] = await linkRows(email);

    const minutes = (row.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14.5);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it("В базе нет самой ссылки, только её хеш", async () => {
    const email = address();
    const before = new Date();
    await request(email);
    const link = loginLink(await waitForLetter(email, before));
    const token = new URL(link).searchParams.get("token") ?? "";

    const [row] = await linkRows(email);

    expect(token.length).toBeGreaterThan(10);
    expect(row.identifier).not.toContain(token);
  });
});

describe("Новая ссылка отменяет старые", () => {
  it("Запросил ссылку дважды", async () => {
    const email = address();
    const first = new Date();
    await request(email);
    const firstLink = loginLink(await waitForLetter(email, first));
    const second = new Date();
    await request(email);
    const secondLink = loginLink(await waitForLetter(email, second));

    expect(firstLink).not.toBe(secondLink);
    expect(await linkRows(email)).toHaveLength(1);
    const old = await openLoginLink(firstLink);
    expect(old.userId).toBeNull();
    expect(old.location).toContain("/login/expired");
    expect((await openLoginLink(secondLink)).userId).not.toBeNull();
  });

  it("Чужая почта не мешает", async () => {
    const anna = address("anna");
    const boris = address("boris");
    const before = new Date();
    await request(anna);
    await request(boris);

    const link = loginLink(await waitForLetter(anna, before));

    expect((await openLoginLink(link)).userId).not.toBeNull();
    expect(await linkRows(boris)).toHaveLength(1);
  });
});

describe("Не больше 3 писем на почту за 10 минут", () => {
  it("Четвёртый запрос", async () => {
    const email = address();
    for (let i = 0; i < 3; i++) {
      expect(await request(email)).toEqual({ sentTo: email });
    }
    const lastLink = (await linkRows(email))[0];

    expect(await request(email)).toEqual({ error: "rate-limited" });

    // No fourth letter, and the third link is not cancelled by the refused request
    expect(await lettersTo(email)).toHaveLength(3);
    expect(await linkRows(email)).toEqual([lastLink]);
  });

  it("Прошло 10 минут", async () => {
    const email = address();
    await sentLetters(email, 11, 3);

    expect(await request(email)).toEqual({ sentTo: email });
  });

  it("Другая почта", async () => {
    const anna = address("anna");
    const boris = address("boris");
    await sentLetters(anna, 1, 3);

    expect(await request(anna)).toEqual({ error: "rate-limited" });
    expect(await request(boris)).toEqual({ sentTo: boris });
  });

  it("Та же почта в другом регистре", async () => {
    const email = address();
    await sentLetters(email, 1, 3);

    expect(await request(email.toUpperCase())).toEqual({
      error: "rate-limited",
    });
  });

  it("Два запроса одновременно при двух уже отправленных", async () => {
    const email = address();
    await sentLetters(email, 1, 2);

    const answers = await Promise.all([request(email), request(email)]);

    expect(answers.filter((answer) => "sentTo" in answer)).toHaveLength(1);
    expect(answers.filter((answer) => "error" in answer)).toEqual([
      { error: "rate-limited" },
    ]);
    expect(await lettersTo(email)).toHaveLength(1);
    expect(
      await db.select().from(signInEmails).where(eq(signInEmails.email, email)),
    ).toHaveLength(3);
  });
});
