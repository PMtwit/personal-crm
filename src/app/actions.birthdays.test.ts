import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createContactAction, updateContactAction } from "@/app/actions";
import { db } from "@/db";
import { contacts } from "@/db/schema";

import {
  createContactWithBirthDate,
  formData,
  signInAs,
} from "../../test/helpers";

// The birth date as the form sends it: three fields, strings. The server
// checks it on every save, by Moscow's calendar. Today is November 15, 2026

const TODAY = new Date("2026-11-15T12:00:00+03:00");

let owner: string;

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ["Date"] });
  owner = await signInAs("owner@example.com");
});

afterEach(() => {
  vi.useRealTimers();
});

// What an action throws instead of returning: a redirect or "not found"
async function thrownBy(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return String((error as { digest?: string }).digest ?? error);
  }
  throw new Error("Expected the action to redirect or say not found");
}

type BirthFields = {
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
};

function create(birth: BirthFields, fields: Record<string, string> = {}) {
  return createContactAction(
    {},
    formData({ name: "Анна", ...fields, ...birth }),
  );
}

function update(id: number, birth: BirthFields) {
  return updateContactAction(id, {}, formData({ name: "Анна", ...birth }));
}

async function birthDates() {
  return db
    .select({
      day: contacts.birthDay,
      month: contacts.birthMonth,
      year: contacts.birthYear,
    })
    .from(contacts)
    .orderBy(contacts.id);
}

async function birthDateOf(id: number) {
  const [row] = await db
    .select({
      day: contacts.birthDay,
      month: contacts.birthMonth,
      year: contacts.birthYear,
    })
    .from(contacts)
    .where(eq(contacts.id, id));
  return row;
}

describe("Поле «Дата рождения» в формах контакта", () => {
  it("Добавил контакт с полной датой", async () => {
    const result = await thrownBy(() =>
      create({ birthDay: "15", birthMonth: "3", birthYear: "1990" }),
    );

    expect(result).toContain("NEXT_REDIRECT");
    expect(await birthDates()).toEqual([{ day: 15, month: 3, year: 1990 }]);
  });

  it("Дата без года", async () => {
    await thrownBy(() =>
      create({ birthDay: "15", birthMonth: "3", birthYear: "" }),
    );

    expect(await birthDates()).toEqual([{ day: 15, month: 3, year: null }]);
  });

  it("Контакт без даты", async () => {
    // Empty fields, as the form sends them, and no fields at all
    await thrownBy(() =>
      create({ birthDay: "", birthMonth: "", birthYear: "" }),
    );
    await thrownBy(() => create({}));

    expect(await birthDates()).toEqual([
      { day: null, month: null, year: null },
      { day: null, month: null, year: null },
    ]);
  });

  it("Изменил дату", async () => {
    const id = await createContactWithBirthDate(owner, "Анна", {
      day: 15,
      month: 3,
    });

    const result = await thrownBy(() =>
      update(id, { birthDay: "16", birthMonth: "3", birthYear: "" }),
    );

    expect(result).toContain("NEXT_REDIRECT");
    expect(await birthDateOf(id)).toEqual({ day: 16, month: 3, year: null });
  });

  it("Убрал дату", async () => {
    const id = await createContactWithBirthDate(owner, "Анна", {
      day: 15,
      month: 3,
      year: 1990,
    });

    await thrownBy(() =>
      update(id, { birthDay: "", birthMonth: "", birthYear: "" }),
    );

    expect(await birthDateOf(id)).toEqual({
      day: null,
      month: null,
      year: null,
    });
  });

  it("spaces around the year do not matter", async () => {
    await thrownBy(() =>
      create({ birthDay: "15", birthMonth: "3", birthYear: " 1990 " }),
    );

    expect(await birthDates()).toEqual([{ day: 15, month: 3, year: 1990 }]);
  });
});

describe("Проверка даты рождения на сервере", () => {
  // The contact is not created, and the error is under the birth date only
  async function expectRefused(birth: BirthFields, message: string) {
    const result = await create(birth);

    expect(result.errors).toEqual({ birthDate: message });
    expect(await db.select().from(contacts)).toEqual([]);
  }

  // A saved contact does not change either
  async function expectUpdateRefused(birth: BirthFields, message: string) {
    const id = await createContactWithBirthDate(owner, "Борис", {
      day: 1,
      month: 6,
      year: 1985,
    });

    const result = await update(id, birth);

    expect(result.errors).toEqual({ birthDate: message });
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row).toMatchObject({
      name: "Борис",
      birthDay: 1,
      birthMonth: 6,
      birthYear: 1985,
    });
  }

  it("День без месяца", async () => {
    await expectRefused({ birthDay: "15" }, "Укажите день и месяц");
    await expectRefused({ birthMonth: "3" }, "Укажите день и месяц");
    await expectRefused(
      { birthDay: "15", birthMonth: "", birthYear: "1990" },
      "Укажите день и месяц",
    );
    await expectUpdateRefused({ birthDay: "15" }, "Укажите день и месяц");
  });

  it("Год без дня и месяца", async () => {
    await expectRefused({ birthYear: "1990" }, "Укажите день и месяц");
    await expectUpdateRefused({ birthYear: "1990" }, "Укажите день и месяц");
  });

  it("Несуществующая дата", async () => {
    await expectRefused({ birthDay: "31", birthMonth: "4" }, "Такой даты нет");
    await expectRefused({ birthDay: "30", birthMonth: "2" }, "Такой даты нет");
    await expectUpdateRefused(
      { birthDay: "31", birthMonth: "4" },
      "Такой даты нет",
    );
  });

  it("29 февраля", async () => {
    await thrownBy(() => create({ birthDay: "29", birthMonth: "2" }));
    await thrownBy(() =>
      create({ birthDay: "29", birthMonth: "2", birthYear: "2000" }),
    );

    expect(await birthDates()).toEqual([
      { day: 29, month: 2, year: null },
      { day: 29, month: 2, year: 2000 },
    ]);
  });

  it("29 февраля невисокосного года", async () => {
    await expectRefused(
      { birthDay: "29", birthMonth: "2", birthYear: "2001" },
      "Такой даты нет",
    );
  });

  it("Год вне диапазона", async () => {
    for (const year of ["1899", "2027", "90", "19a0", "01990", "-1990"]) {
      await expectRefused(
        { birthDay: "15", birthMonth: "3", birthYear: year },
        "Укажите год от 1900 до 2026",
      );
    }
    await expectUpdateRefused(
      { birthDay: "15", birthMonth: "3", birthYear: "2027" },
      "Укажите год от 1900 до 2026",
    );
  });

  it("the last year of the range is Moscow's", async () => {
    // 00:30 on January 1, 2027 in Moscow, still 2026 in UTC
    vi.setSystemTime(new Date("2026-12-31T21:30:00Z"));
    // The session made "on November 15" has expired by then: log in again
    await signInAs("owner@example.com");

    const result = await thrownBy(() =>
      create({ birthDay: "1", birthMonth: "1", birthYear: "2027" }),
    );

    expect(result).toContain("/contacts/");
    expect(await birthDates()).toEqual([{ day: 1, month: 1, year: 2027 }]);
  });

  it("Дата ещё не наступила", async () => {
    await expectRefused(
      { birthDay: "20", birthMonth: "11", birthYear: "2026" },
      "Эта дата ещё не наступила",
    );
    await expectUpdateRefused(
      { birthDay: "16", birthMonth: "11", birthYear: "2026" },
      "Эта дата ещё не наступила",
    );
  });

  it("today is a date that has come", async () => {
    await thrownBy(() =>
      create({ birthDay: "15", birthMonth: "11", birthYear: "2026" }),
    );

    expect(await birthDates()).toEqual([{ day: 15, month: 11, year: 2026 }]);
  });

  it("Ошибка не стирает введённое", async () => {
    const result = await create(
      { birthDay: "31", birthMonth: "4", birthYear: "" },
      { phone: "+7 900 123-45-67" },
    );

    expect(result.errors).toEqual({ birthDate: "Такой даты нет" });
    expect(result.values).toMatchObject({
      name: "Анна",
      phone: "+7 900 123-45-67",
      birthDay: "31",
      birthMonth: "4",
      birthYear: "",
    });
  });

  it("Неверная дата прямым запросом к серверу", async () => {
    await expectRefused({ birthDay: "32", birthMonth: "3" }, "Такой даты нет");
    await expectRefused({ birthDay: "15", birthMonth: "13" }, "Такой даты нет");
    await expectRefused({ birthDay: "0", birthMonth: "3" }, "Такой даты нет");
    await expectRefused({ birthDay: "abc", birthMonth: "3" }, "Такой даты нет");
    await expectRefused({ birthDay: "1.5", birthMonth: "3" }, "Такой даты нет");
    await expectRefused(
      { birthDay: "99999999999999999999", birthMonth: "3" },
      "Такой даты нет",
    );
    await expectUpdateRefused(
      { birthDay: "32", birthMonth: "13" },
      "Такой даты нет",
    );
  });

  it("another field's error comes together with the date's", async () => {
    const result = await createContactAction(
      {},
      formData({ name: "", birthDay: "31", birthMonth: "4" }),
    );

    expect(result.errors).toEqual({
      name: "Укажите имя",
      birthDate: "Такой даты нет",
    });
  });
});
