import { eq, sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  getTouchStatus,
  listDueContacts,
  updateTouchInterval,
} from "@/lib/data";
import type { TouchInterval } from "@/lib/keep-in-touch";

// The due date is counted in SQL, so these tests run on the real test database.
// Exact dates do not depend on today: dueAt is only the last note plus the
// interval. Noon UTC keeps the dates away from the edges of a day

function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

// A moment counted by the database's clock, the one the app uses for "now"
function ago(interval: string): SQL<Date> {
  return sql<Date>`now() - ${interval}::interval`;
}

// Interval chosen long ago, unless the test says when
async function contactWith(
  interval: TouchInterval,
  setAt: Date | SQL<Date> = utcNoon("2020-01-01"),
): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values({
      name: "Анна",
      touchInterval: interval,
      touchIntervalSetAt: setAt as Date,
    })
    .returning({ id: contacts.id });
  return row.id;
}

async function noteAt(contactId: number, createdAt: Date | SQL<Date>) {
  await db.insert(notes).values({
    contactId,
    body: "Созвонились",
    createdAt: createdAt as Date,
  });
}

async function dueAtAfterNote(interval: TouchInterval, noteDate: string) {
  const id = await contactWith(interval);
  await noteAt(id, utcNoon(noteDate));
  return (await getTouchStatus(id)).dueAt;
}

// A contact "once a week" whose due date is the given time away from now:
// the last note was written a week plus that time ago
async function overdueBy(interval: string): Promise<number> {
  const id = await contactWith("week");
  await noteAt(
    id,
    sql<Date>`now() - interval '7 days' - ${interval}::interval`,
  );
  return id;
}

async function isInDueBlock(id: number): Promise<boolean> {
  return (await listDueContacts()).some((contact) => contact.id === id);
}

// Whether a moment is within a few seconds of "now + days" by the database's clock
async function isAboutDaysFromNow(date: Date | null, days: number) {
  const { rows } = await db.execute<{ close: boolean }>(
    sql`select abs(extract(epoch from ${date!.toISOString()}::timestamptz - (now() + ${`${days} days`}::interval))) < 30 as close`,
  );
  return rows[0].close;
}

describe("Срок отсчитывается от последней заметки", () => {
  it.each([
    ["week", "2026-01-10", "2026-01-17"],
    ["month", "2026-01-10", "2026-02-10"],
    ["quarter", "2026-01-10", "2026-04-10"],
    ["year", "2026-01-10", "2027-01-10"],
  ] as const)("%s: заметка %s → срок %s", async (interval, note, due) => {
    expect(await dueAtAfterNote(interval, note)).toEqual(utcNoon(due));
  });

  it("неделя - это 7 дней и на границе месяца и года", async () => {
    expect(await dueAtAfterNote("week", "2026-12-28")).toEqual(
      utcNoon("2027-01-04"),
    );
  });

  it.each([
    ["месяц из 31 дня в февраль", "month", "2026-01-31", "2026-02-28"],
    ["то же в високосный год", "month", "2028-01-31", "2028-02-29"],
    ["месяц из 31 дня в месяц из 30", "month", "2026-03-31", "2026-04-30"],
    ["квартал в февраль", "quarter", "2026-11-30", "2027-02-28"],
    ["год от 29 февраля", "year", "2028-02-29", "2029-02-28"],
  ] as const)(
    "дня нет в нужном месяце, берётся последний: %s",
    async (_case, interval, note, due) => {
      expect(await dueAtAfterNote(interval, note)).toEqual(utcNoon(due));
    },
  );

  it("считается последняя по дате заметка, а не последняя добавленная", async () => {
    const id = await contactWith("month");
    await noteAt(id, utcNoon("2026-03-05"));
    await noteAt(id, utcNoon("2026-01-10"));

    expect((await getTouchStatus(id)).dueAt).toEqual(utcNoon("2026-04-05"));
  });

  it("новая заметка запускает отсчёт заново", async () => {
    const id = await overdueBy("15 days");
    expect(await isInDueBlock(id)).toBe(true);

    await noteAt(id, sql<Date>`now()`);

    expect(await isInDueBlock(id)).toBe(false);
    const { dueAt } = await getTouchStatus(id);
    expect(await isAboutDaysFromNow(dueAt, 7)).toBe(true);
  });

  it("заметка важнее выбора частоты, даже если частоту выбрали позже", async () => {
    const id = await contactWith("month", utcNoon("2026-06-01"));
    await noteAt(id, utcNoon("2026-01-10"));

    expect((await getTouchStatus(id)).dueAt).toEqual(utcNoon("2026-02-10"));
  });
});

describe("Без заметок срок отсчитывается от выбора частоты", () => {
  it("выбрал «Раз в месяц» 1 октября → срок 1 ноября", async () => {
    const id = await contactWith("month", utcNoon("2026-10-01"));

    expect((await getTouchStatus(id)).dueAt).toEqual(utcNoon("2026-11-01"));
  });

  it("смена частоты запускает отсчёт заново от момента смены", async () => {
    const id = await contactWith("year", ago("19 days"));

    await updateTouchInterval(id, "week");

    const { dueAt } = await getTouchStatus(id);
    expect(await isAboutDaysFromNow(dueAt, 7)).toBe(true);
  });

  it("повторный выбор той же частоты отсчёт не сбрасывает", async () => {
    const id = await contactWith("week", utcNoon("2026-01-10"));

    await updateTouchInterval(id, "week");

    expect((await getTouchStatus(id)).dueAt).toEqual(utcNoon("2026-01-17"));
  });
});

describe("Смена частоты у контакта с заметками", () => {
  it("срок пересчитывается от той же заметки, отсчёт не сбрасывается", async () => {
    const id = await contactWith("year");
    await noteAt(id, utcNoon("2026-01-10"));
    expect((await getTouchStatus(id)).dueAt).toEqual(utcNoon("2027-01-10"));

    await updateTouchInterval(id, "month");

    expect((await getTouchStatus(id)).dueAt).toEqual(utcNoon("2026-02-10"));
  });

  it("заметке 3 месяца, выбрал «Раз в месяц» → контакт сразу в блоке", async () => {
    const [{ id }] = await db
      .insert(contacts)
      .values({ name: "Анна" })
      .returning({ id: contacts.id });
    await noteAt(id, ago("3 months"));
    expect(await isInDueBlock(id)).toBe(false);

    await updateTouchInterval(id, "month");

    expect(await isInDueBlock(id)).toBe(true);
    // About two months past the due date: 58 to 62 days, whatever the months
    const { overdueDays } = await getTouchStatus(id);
    expect(overdueDays).toBeGreaterThanOrEqual(58);
    expect(overdueDays).toBeLessThanOrEqual(62);
  });

  it("убрал частоту → срока нет, контакта нет в блоке, заметки на месте", async () => {
    const id = await overdueBy("15 days");

    await updateTouchInterval(id, null);

    expect(await getTouchStatus(id)).toEqual({
      touchInterval: null,
      dueAt: null,
      overdueDays: 0,
    });
    expect(await isInDueBlock(id)).toBe(false);
    expect(
      await db.select().from(notes).where(eq(notes.contactId, id)),
    ).toHaveLength(1);
  });
});

describe("Граница: когда срок наступил и сколько дней просрочено", () => {
  it("контакт без частоты: срока нет", async () => {
    const [{ id }] = await db
      .insert(contacts)
      .values({ name: "Анна" })
      .returning({ id: contacts.id });
    await noteAt(id, ago("400 days"));

    expect(await getTouchStatus(id)).toEqual({
      touchInterval: null,
      dueAt: null,
      overdueDays: 0,
    });
    expect(await isInDueBlock(id)).toBe(false);
  });

  it("за минуту до срока: срок ещё впереди, контакта нет в блоке", async () => {
    const id = await overdueBy("-1 minute");

    expect((await getTouchStatus(id)).overdueDays).toBeLessThan(0);
    expect(await isInDueBlock(id)).toBe(false);
  });

  it.each([
    ["минуту спустя", "1 minute", 0],
    ["через 23 часа 59 минут", "23 hours 59 minutes", 0],
    ["через 24 часа 1 минуту", "1 day 1 minute", 1],
    ["через 2 суток без минуты", "1 day 23 hours 59 minutes", 1],
    ["через 15 суток", "15 days 1 minute", 15],
  ] as const)(
    "%s: контакт в блоке, полных дней просрочки столько, сколько прошло",
    async (_case, passed, days) => {
      const id = await overdueBy(passed);

      expect((await getTouchStatus(id)).overdueDays).toBe(days);
      const [due] = await listDueContacts();
      expect(due).toMatchObject({ id, overdueDays: days });
    },
  );

  it("блок и карточка называют один и тот же срок", async () => {
    const id = await overdueBy("15 days 1 minute");

    const [due] = await listDueContacts();
    const card = await getTouchStatus(id);

    expect(due.dueAt).toEqual(card.dueAt);
    expect(due.touchInterval).toBe(card.touchInterval);
  });
});
