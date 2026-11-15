import { APP_TIME_ZONE } from "@/lib/time-zone";

// The whole birthday calendar: the next birthday, February 29, the turn of the
// year, the age. Pure functions: "today" is always passed in, so a test can use
// any date. The only place that reads the clock is todayInAppTimeZone

// A day of the calendar; months are 1-12
export type CalendarDay = { year: number; month: number; day: number };

// A birth date as it is stored: the year may be unknown
export type BirthDate = { day: number; month: number; year: number | null };

// A contact's row with a birth date, as the database gives it
export type WithBirthDate = {
  birthDay: number;
  birthMonth: number;
  birthYear: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const calendarFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: APP_TIME_ZONE,
});

// Today by Moscow's calendar. The clock is the app server's, not the
// database's: there are no moments from the database to compare with here,
// only the calendar
export function todayInAppTimeZone(now: Date = new Date()): CalendarDay {
  const parts = calendarFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

// Days in a month; without a year February has 29: any year may be the one
function daysInMonth(month: number, year: number | null): number {
  if (month === 2) {
    return year === null || isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// The date exists in the calendar: April 31 and February 29, 2001 do not.
// The range of years is checked apart: it has its own message
export function isValidBirthDate(
  day: number,
  month: number,
  year: number | null,
): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) {
    return false;
  }
  if (year !== null && !Number.isInteger(year)) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(month, year);
}

// The day the birthday is celebrated in a given year: someone born on
// February 29 celebrates on February 28 in a non-leap year
export function celebrationDay(
  birth: Pick<BirthDate, "day" | "month">,
  year: number,
): CalendarDay {
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
    return { year, month: 2, day: 28 };
  }
  return { year, month: birth.month, day: birth.day };
}

function daysBetween(from: CalendarDay, to: CalendarDay): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

export type NextBirthday = {
  // 0 means today
  daysUntil: number;
  // How old the person turns; null without a year or for someone born today
  turningAge: number | null;
};

// The nearest birthday: this year's if it is today or later, otherwise next year's
export function nextBirthday(
  birth: BirthDate,
  today: CalendarDay,
): NextBirthday {
  let celebration = celebrationDay(birth, today.year);
  if (daysBetween(today, celebration) < 0) {
    celebration = celebrationDay(birth, today.year + 1);
  }
  const turningAge = birth.year === null ? null : celebration.year - birth.year;
  return {
    daysUntil: daysBetween(today, celebration),
    turningAge: turningAge === null || turningAge <= 0 ? null : turningAge,
  };
}

// Full years today; null without a year. The person is a year older from the
// day of the celebration, so February 29 people on February 28 of a non-leap year
export function ageOn(birth: BirthDate, today: CalendarDay): number | null {
  if (birth.year === null) {
    return null;
  }
  const celebration = celebrationDay(birth, today.year);
  const hadBirthday = daysBetween(celebration, today) >= 0;
  return today.year - birth.year - (hadBirthday ? 0 : 1);
}

export function birthDateOf(contact: WithBirthDate): BirthDate {
  return {
    day: contact.birthDay,
    month: contact.birthMonth,
    year: contact.birthYear,
  };
}

// Contacts whose birthday is today or in one of the next `days` days, the
// nearest first. The sort is stable: within one day the order stays as it
// came, by name from the database
export function upcomingBirthdays<T extends WithBirthDate>(
  contacts: T[],
  today: CalendarDay,
  days = 7,
): (T & NextBirthday)[] {
  return contacts
    .map((contact) => ({
      ...contact,
      ...nextBirthday(birthDateOf(contact), today),
    }))
    .filter((contact) => contact.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
