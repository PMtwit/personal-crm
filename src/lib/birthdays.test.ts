import { describe, expect, it } from "vitest";

import {
  ageOn,
  isValidBirthDate,
  nextBirthday,
  todayInAppTimeZone,
  upcomingBirthdays,
  type CalendarDay,
} from "@/lib/birthdays";

// "Today" is always given to the functions: no test depends on the real clock

function day(year: number, month: number, dayOfMonth: number): CalendarDay {
  return { year, month, day: dayOfMonth };
}

function contact(
  name: string,
  birthDay: number,
  birthMonth: number,
  birthYear: number | null = null,
) {
  return { name, birthDay, birthMonth, birthYear };
}

function names(list: { name: string }[]): string[] {
  return list.map((item) => item.name);
}

const NOVEMBER_15 = day(2026, 11, 15);

describe("Блок «Скоро день рождения» на главной", () => {
  it("Сегодня и через неделю", () => {
    const upcoming = upcomingBirthdays(
      [
        contact("Анна", 15, 11),
        contact("Борис", 22, 11),
        contact("Вера", 23, 11),
        contact("Глеб", 14, 11),
      ],
      NOVEMBER_15,
    );

    expect(names(upcoming)).toEqual(["Анна", "Борис"]);
    expect(upcoming.map((item) => item.daysUntil)).toEqual([0, 7]);
  });

  it("Ближайшие сверху", () => {
    const upcoming = upcomingBirthdays(
      [
        contact("Анна", 20, 11),
        contact("Борис", 16, 11),
        contact("Вера", 15, 11),
      ],
      NOVEMBER_15,
    );

    expect(names(upcoming)).toEqual(["Вера", "Борис", "Анна"]);
  });

  it("В один день - по имени", () => {
    // The contacts come from the database already sorted by name: the order
    // within one day stays as it came
    const upcoming = upcomingBirthdays(
      [
        contact("Анна", 18, 11),
        contact("Борис", 18, 11),
        contact("Вера", 16, 11),
      ],
      NOVEMBER_15,
    );

    expect(names(upcoming)).toEqual(["Вера", "Анна", "Борис"]);
  });

  it("Через Новый год", () => {
    const upcoming = upcomingBirthdays(
      [contact("Анна", 3, 1), contact("Борис", 5, 1)],
      day(2026, 12, 28),
    );

    expect(names(upcoming)).toEqual(["Анна"]);
    expect(upcoming[0].daysUntil).toBe(6);
  });

  it("Без года и с годом", () => {
    const upcoming = upcomingBirthdays(
      [contact("Анна", 18, 11), contact("Борис", 18, 11, 1990)],
      NOVEMBER_15,
    );

    expect(names(upcoming)).toEqual(["Анна", "Борис"]);
  });

  it("Полночь по Москве", () => {
    // 00:30 on November 16 in Moscow, still 21:30 on November 15 in UTC
    const today = todayInAppTimeZone(new Date("2026-11-15T21:30:00Z"));

    expect(today).toEqual(day(2026, 11, 16));
    const upcoming = upcomingBirthdays([contact("Анна", 16, 11)], today);
    expect(upcoming).toMatchObject([{ name: "Анна", daysUntil: 0 }]);
  });

  it("the day before Moscow's midnight is still that day", () => {
    expect(todayInAppTimeZone(new Date("2026-11-15T20:59:59Z"))).toEqual(
      NOVEMBER_15,
    );
  });

  it("the window can be another length", () => {
    const upcoming = upcomingBirthdays(
      [contact("Анна", 15, 11), contact("Борис", 17, 11)],
      NOVEMBER_15,
      1,
    );

    expect(names(upcoming)).toEqual(["Анна"]);
  });
});

describe("29 февраля в невисокосный год", () => {
  const anna = contact("Анна", 29, 2);

  it("Невисокосный год", () => {
    const upcoming = upcomingBirthdays([anna], day(2027, 2, 25));

    expect(upcoming).toMatchObject([{ name: "Анна", daysUntil: 3 }]);
  });

  it("Високосный год", () => {
    const upcoming = upcomingBirthdays([anna], day(2028, 2, 25));

    expect(upcoming).toMatchObject([{ name: "Анна", daysUntil: 4 }]);
  });

  it("1 марта невисокосного года", () => {
    expect(upcomingBirthdays([anna], day(2027, 3, 1))).toEqual([]);
  });

  it("on February 28 of a non-leap year it is today", () => {
    expect(
      nextBirthday({ day: 29, month: 2, year: 2000 }, day(2027, 2, 28)),
    ).toEqual({ daysUntil: 0, turningAge: 27 });
  });
});

describe("Дата рождения в карточке", () => {
  it("Возраст до и в день рождения", () => {
    const birth = { day: 16, month: 11, year: 1990 };

    expect(ageOn(birth, NOVEMBER_15)).toBe(35);
    expect(ageOn(birth, day(2026, 11, 16))).toBe(36);
  });

  it("Меньше года", () => {
    expect(ageOn({ day: 1, month: 3, year: 2026 }, NOVEMBER_15)).toBe(0);
  });

  it("without a year there is no age", () => {
    expect(ageOn({ day: 15, month: 3, year: null }, NOVEMBER_15)).toBeNull();
  });

  it("born on February 29: a year older on February 28 of a non-leap year", () => {
    const birth = { day: 29, month: 2, year: 2000 };

    expect(ageOn(birth, day(2027, 2, 27))).toBe(26);
    expect(ageOn(birth, day(2027, 2, 28))).toBe(27);
    expect(ageOn(birth, day(2028, 2, 28))).toBe(27);
    expect(ageOn(birth, day(2028, 2, 29))).toBe(28);
  });
});

describe("Строка контакта в блоке «Скоро день рождения»", () => {
  it("Сколько исполнится", () => {
    expect(
      nextBirthday({ day: 18, month: 11, year: 1990 }, NOVEMBER_15),
    ).toEqual({ daysUntil: 3, turningAge: 36 });
  });

  it("Год не указан", () => {
    expect(
      nextBirthday({ day: 18, month: 11, year: null }, NOVEMBER_15),
    ).toEqual({ daysUntil: 3, turningAge: null });
  });

  it("born today: nothing to turn", () => {
    expect(
      nextBirthday({ day: 15, month: 11, year: 2026 }, NOVEMBER_15),
    ).toEqual({ daysUntil: 0, turningAge: null });
  });

  it("a birthday that has passed this year counts from next year", () => {
    expect(
      nextBirthday({ day: 14, month: 11, year: 1990 }, NOVEMBER_15),
    ).toEqual({ daysUntil: 364, turningAge: 37 });
  });

  it("the turning age comes with the row", () => {
    const [anna] = upcomingBirthdays(
      [contact("Анна", 18, 11, 1990)],
      NOVEMBER_15,
    );

    expect(anna).toEqual({
      name: "Анна",
      birthDay: 18,
      birthMonth: 11,
      birthYear: 1990,
      daysUntil: 3,
      turningAge: 36,
    });
  });
});

describe("Проверка даты рождения на сервере", () => {
  it("Несуществующая дата", () => {
    expect(isValidBirthDate(31, 4, null)).toBe(false);
    expect(isValidBirthDate(30, 2, null)).toBe(false);
    expect(isValidBirthDate(32, 1, null)).toBe(false);
    expect(isValidBirthDate(0, 1, null)).toBe(false);
    expect(isValidBirthDate(1, 13, null)).toBe(false);
    expect(isValidBirthDate(1, 0, null)).toBe(false);
    expect(isValidBirthDate(1.5, 1, null)).toBe(false);
  });

  it("29 февраля", () => {
    expect(isValidBirthDate(29, 2, null)).toBe(true);
    expect(isValidBirthDate(29, 2, 2000)).toBe(true);
    expect(isValidBirthDate(29, 2, 2024)).toBe(true);
  });

  it("29 февраля невисокосного года", () => {
    expect(isValidBirthDate(29, 2, 2001)).toBe(false);
    expect(isValidBirthDate(29, 2, 1900)).toBe(false);
  });

  it("ordinary dates exist", () => {
    expect(isValidBirthDate(31, 12, 1990)).toBe(true);
    expect(isValidBirthDate(30, 4, null)).toBe(true);
    expect(isValidBirthDate(1, 1, 1900)).toBe(true);
  });
});
