import { z } from "zod";

import {
  isValidBirthDate,
  todayInAppTimeZone,
  type CalendarDay,
} from "@/lib/birthdays";

// Error messages are shown to the user, so they are in Russian

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Слишком длинно: не больше ${max} символов`)
    .transform((value) => (value === "" ? null : value));
}

const emailFormat = z.email();

// A field of the birth date as the form sends it; checked together below
const birthDatePart = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

const FIRST_BIRTH_YEAR = 1900;

function isAfter(a: CalendarDay, b: CalendarDay): boolean {
  return (
    a.year * 10000 + a.month * 100 + a.day >
    b.year * 10000 + b.month * 100 + b.day
  );
}

// What is wrong with the birth date, or null if nothing: no date at all is fine.
// "Today" is Moscow's: the last year and "not later than today" depend on it
function birthDateError(
  raw: { day: string | null; month: string | null; year: string | null },
  today: CalendarDay,
): string | null {
  if (raw.day === null && raw.month === null) {
    return raw.year === null ? null : "Укажите день и месяц";
  }
  if (raw.day === null || raw.month === null) {
    return "Укажите день и месяц";
  }
  if (!/^\d{1,2}$/.test(raw.day) || !/^\d{1,2}$/.test(raw.month)) {
    return "Такой даты нет";
  }
  const day = Number(raw.day);
  const month = Number(raw.month);
  // The day and the month first: without a year February has 29
  if (!isValidBirthDate(day, month, null)) {
    return "Такой даты нет";
  }
  if (raw.year === null) {
    return null;
  }
  const year = /^\d{4}$/.test(raw.year) ? Number(raw.year) : null;
  if (year === null || year < FIRST_BIRTH_YEAR || year > today.year) {
    return `Укажите год от ${FIRST_BIRTH_YEAR} до ${today.year}`;
  }
  // February 29 of a year that is not a leap one
  if (!isValidBirthDate(day, month, year)) {
    return "Такой даты нет";
  }
  if (isAfter({ year, month, day }, today)) {
    return "Эта дата ещё не наступила";
  }
  return null;
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Укажите имя")
      .max(200, "Слишком длинно: не больше 200 символов"),
    about: optionalText(1000),
    howWeMet: optionalText(1000),
    phone: optionalText(50),
    email: optionalText(254).refine(
      (value) => value === null || emailFormat.safeParse(value).success,
      "Похоже, в адресе почты ошибка",
    ),
    birthDay: birthDatePart,
    birthMonth: birthDatePart,
    birthYear: birthDatePart,
  })
  // One message for the three fields, under the whole "Birth date"
  .superRefine((contact, context) => {
    const message = birthDateError(
      {
        day: contact.birthDay,
        month: contact.birthMonth,
        year: contact.birthYear,
      },
      todayInAppTimeZone(),
    );
    if (message !== null) {
      context.addIssue({ code: "custom", path: ["birthDate"], message });
    }
  })
  .transform(({ birthDay, birthMonth, birthYear, ...contact }) => ({
    ...contact,
    birthDay: toNumber(birthDay),
    birthMonth: toNumber(birthMonth),
    birthYear: toNumber(birthYear),
  }));

export type ContactInput = z.infer<typeof contactSchema>;

export const contactFields = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
  "birthDay",
  "birthMonth",
  "birthYear",
] as const;

export type ContactField = (typeof contactFields)[number];
export type ContactValues = Record<ContactField, string>;

// Where a form error is shown: under a field, or under the whole birth date
export type ContactErrorKey = ContactField | "birthDate";

const MAX_ID = 2_147_483_647;

// Contact or group id from the URL or a form; null for anything that cannot be an id
export function parseId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) {
    return null;
  }
  const id = Number(raw);
  return id >= 1 && id <= MAX_ID ? id : null;
}

// A saved contact as the form shows it: every field is text, an empty one is ""
export function toContactValues(contact: {
  [field in ContactField]: string | number | null;
}): ContactValues {
  return Object.fromEntries(
    contactFields.map((field) => [field, String(contact[field] ?? "")]),
  ) as ContactValues;
}

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Заметка пустая")
    .max(10000, "Слишком длинно: не больше 10 000 символов"),
});

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите название")
  .max(50, "Слишком длинно: не больше 50 символов");
