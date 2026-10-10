import { z } from "zod";

// Error messages are shown to the user, so they are in Russian

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Слишком длинно: не больше ${max} символов`)
    .transform((value) => (value === "" ? null : value));
}

const emailFormat = z.email();

export const contactSchema = z.object({
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
});

export type ContactInput = z.infer<typeof contactSchema>;

export const contactFields = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
] as const;

export type ContactField = (typeof contactFields)[number];
export type ContactValues = Record<ContactField, string>;

const MAX_ID = 2_147_483_647;

// Contact id from the URL; null for anything that cannot be an id
export function parseContactId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) {
    return null;
  }
  const id = Number(raw);
  return id >= 1 && id <= MAX_ID ? id : null;
}

export function toContactValues(contact: {
  [field in ContactField]: string | null;
}): ContactValues {
  return Object.fromEntries(
    contactFields.map((field) => [field, contact[field] ?? ""]),
  ) as ContactValues;
}

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Заметка пустая")
    .max(10000, "Слишком длинно: не больше 10 000 символов"),
});
