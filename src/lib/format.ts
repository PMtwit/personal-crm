const pluralRules = new Intl.PluralRules("ru-RU");

type PluralForms = { one: string; few: string; many: string };

export function pluralize(count: number, forms: PluralForms): string {
  const rule = pluralRules.select(count);
  const word = rule === "one" ? forms.one : rule === "few" ? forms.few : forms.many;
  return `${count.toLocaleString("ru-RU")} ${word}`;
}

export function contactsCount(count: number): string {
  return pluralize(count, { one: "контакт", few: "контакта", many: "контактов" });
}

export function notesCount(count: number): string {
  return pluralize(count, { one: "заметка", few: "заметки", many: "заметок" });
}

export function daysCount(count: number): string {
  return pluralize(count, { one: "день", few: "дня", many: "дней" });
}

const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// "15 ноября"; the year is added only if it is not the current one: "15 ноября 2027".
// Built from parts, because ru-RU appends " г." to a full date
export function formatDueDate(date: Date, now: Date = new Date()): string {
  const parts = dayMonthFormat.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  const dayAndMonth = `${part("day")} ${part("month")}`;
  return date.getFullYear() === now.getFullYear()
    ? dayAndMonth
    : `${dayAndMonth} ${part("year")}`;
}

// How late the contact is, in whole days after the due date
export function overdueText(overdueDays: number): string {
  return overdueDays >= 1
    ? `просрочено на ${daysCount(overdueDays)}`
    : "срок подошёл";
}

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// Letter used to group the contact list; "Ё" goes together with "Е"
export function groupLetter(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase();
  if (letter === "Ё") {
    return "Е";
  }
  return /\p{L}/u.test(letter) ? letter : "#";
}
