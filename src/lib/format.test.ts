import { describe, expect, it } from "vitest";

import { contactsCount, formatDueDate, overdueText } from "@/lib/format";

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
  // Local dates, as the function formats them
  const now = new Date(2026, 5, 15, 12);

  it("this year: the day and the month, no year", () => {
    expect(formatDueDate(new Date(2026, 10, 15, 12), now)).toBe("15 ноября");
    expect(formatDueDate(new Date(2026, 0, 1, 12), now)).toBe("1 января");
    expect(formatDueDate(new Date(2026, 11, 31, 12), now)).toBe("31 декабря");
  });

  it("another year, later or earlier: with the year, without « г.»", () => {
    expect(formatDueDate(new Date(2027, 10, 15, 12), now)).toBe(
      "15 ноября 2027",
    );
    expect(formatDueDate(new Date(2025, 10, 15, 12), now)).toBe(
      "15 ноября 2025",
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
