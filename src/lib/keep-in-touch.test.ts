import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { touchStatusLine } from "@/lib/keep-in-touch";

// Local dates: the line is made in the server's time zone. Noon keeps a date
// away from the edges of a day
const TODAY = new Date(2026, 5, 15, 12);
const DUE_THIS_YEAR = new Date(2026, 10, 15, 12);
const DUE_NEXT_YEAR = new Date(2027, 10, 15, 12);

describe("Карточка показывает срок", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: TODAY, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("частота не задана → срока нет", () => {
    expect(touchStatusLine(null, 0)).toBeNull();
  });

  it("срок впереди → «Связаться до 15 ноября», не красным", () => {
    expect(touchStatusLine(DUE_THIS_YEAR, -153)).toEqual({
      text: "Связаться до 15 ноября",
      overdue: false,
    });
  });

  it("срок в другом году → с годом", () => {
    expect(touchStatusLine(DUE_NEXT_YEAR, -518)).toEqual({
      text: "Связаться до 15 ноября 2027",
      overdue: false,
    });
  });

  it("до срока меньше суток → ещё «Связаться до»", () => {
    expect(touchStatusLine(DUE_THIS_YEAR, -1)).toMatchObject({
      text: "Связаться до 15 ноября",
      overdue: false,
    });
  });

  it("прошло меньше суток → «Пора связаться: срок подошёл», красным", () => {
    expect(touchStatusLine(TODAY, 0)).toEqual({
      text: "Пора связаться: срок подошёл",
      overdue: true,
    });
  });

  it.each([
    [1, "Пора связаться: просрочено на 1 день"],
    [2, "Пора связаться: просрочено на 2 дня"],
    [15, "Пора связаться: просрочено на 15 дней"],
    [21, "Пора связаться: просрочено на 21 день"],
  ])("прошло %i → «%s», красным", (days, text) => {
    expect(touchStatusLine(TODAY, days)).toEqual({ text, overdue: true });
  });
});
