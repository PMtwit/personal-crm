import { describe, expect, it } from "vitest";

import {
  contactsCount,
  formatDateTime,
  formatDueDate,
  overdueText,
} from "@/lib/format";

describe("contactsCount", () => {
  it("1 -> «1 контакт»", () => {
    expect(contactsCount(1)).toBe("1 контакт");
  });

  it("3 -> «3 контакта»", () => {
    expect(contactsCount(3)).toBe("3 контакта");
  });

  it("5 -> «5 контактов»", () => {
    expect(contactsCount(5)).toBe("5 контактов");
  });

  it("0, 11 and 21 take the right form", () => {
    expect(contactsCount(0)).toBe("0 контактов");
    expect(contactsCount(11)).toBe("11 контактов");
    expect(contactsCount(21)).toBe("21 контакт");
  });
});

describe("formatDueDate", () => {
  function moscowNoon(date: string): Date {
    return new Date(`${date}T12:00:00+03:00`);
  }

  const now = moscowNoon("2026-06-15");
  // 00:30 on 1 January 2027 in Moscow, still 31 December 2026 in UTC
  const newYearNight = new Date("2026-12-31T21:30:00Z");

  it("this year: the day and the month, no year", () => {
    expect(formatDueDate(moscowNoon("2026-11-15"), now)).toBe("15 ноября");
    expect(formatDueDate(moscowNoon("2026-01-01"), now)).toBe("1 января");
    expect(formatDueDate(moscowNoon("2026-12-31"), now)).toBe("31 декабря");
  });

  it("another year, later or earlier: with the year, without « г.»", () => {
    expect(formatDueDate(moscowNoon("2027-11-15"), now)).toBe("15 ноября 2027");
    expect(formatDueDate(moscowNoon("2025-11-15"), now)).toBe("15 ноября 2025");
  });

  it("the day is Moscow's: 01:00 there is still the day before in UTC", () => {
    expect(formatDueDate(new Date("2026-02-09T22:00:00Z"), now)).toBe(
      "10 февраля",
    );
  });

  it("the date's year is Moscow's", () => {
    expect(formatDueDate(newYearNight, now)).toBe("1 января 2027");
  });

  it("the current year is Moscow's", () => {
    expect(formatDueDate(moscowNoon("2027-03-01"), newYearNight)).toBe(
      "1 марта",
    );
    expect(formatDueDate(moscowNoon("2026-12-31"), newYearNight)).toBe(
      "31 декабря 2026",
    );
  });
});

describe("formatDateTime", () => {
  it("the date and the time are Moscow's", () => {
    expect(formatDateTime(new Date("2026-01-09T22:30:00Z"))).toBe(
      "10 января 2026 г. в 01:30",
    );
  });
});

describe("overdueText", () => {
  it("less than a day -> «срок подошёл»", () => {
    expect(overdueText(0)).toBe("срок подошёл");
  });

  it.each([
    [1, "просрочено на 1 день"],
    [2, "просрочено на 2 дня"],
    [5, "просрочено на 5 дней"],
    [11, "просрочено на 11 дней"],
    [21, "просрочено на 21 день"],
    [101, "просрочено на 101 день"],
  ])("%i -> «%s»", (days, text) => {
    expect(overdueText(days)).toBe(text);
  });
});
