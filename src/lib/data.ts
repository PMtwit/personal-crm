import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import type { TouchInterval } from "@/lib/keep-in-touch";
import { escapeLike, searchTerms } from "@/lib/search";
import type { ContactInput } from "@/lib/validation";

export type ContactListItem = Pick<
  typeof contacts.$inferSelect,
  "id" | "name" | "about" | "phone" | "email"
>;

export async function listContacts(query: string): Promise<ContactListItem[]> {
  const normalizedName = sql`replace(lower(${contacts.name}), 'ё', 'е')`;
  const conditions = searchTerms(query).map(
    (term) => sql`${normalizedName} like ${`%${escapeLike(term)}%`}`,
  );

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    // Russian alphabetical order: "Александр Ермаков" before "Александра Белых",
    // "Ё" next to "Е" (the default collation ignores spaces)
    .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

export async function countContacts(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(contacts);
  return row.total;
}

export async function getContact(id: number) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id));
  return contact ?? null;
}

export async function listNotes(contactId: number) {
  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

export async function insertContact(input: ContactInput): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values(input)
    .returning({ id: contacts.id });
  return row.id;
}

export async function updateContact(
  id: number,
  input: ContactInput,
): Promise<boolean> {
  const updated = await db
    .update(contacts)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length > 0;
}

// Returns the deleted contact's name, or null if there was no such contact.
// The contact's notes are deleted by the database: the foreign key cascades
export async function deleteContact(id: number): Promise<string | null> {
  const [deleted] = await db
    .delete(contacts)
    .where(eq(contacts.id, id))
    .returning({ name: contacts.name });
  return deleted?.name ?? null;
}

export async function insertNote(
  contactId: number,
  body: string,
): Promise<boolean> {
  const contact = await getContact(contactId);
  if (!contact) {
    return false;
  }
  await db.insert(notes).values({ contactId, body });
  return true;
}

// Interval -> how far the due date is from the last contact. The only place
// where this mapping lives. Postgres adds months by the calendar and clamps to
// the end of the month: January 31 + 1 month = February 28 (29)
function touchIntervalSql(interval: SQL | typeof contacts.touchInterval): SQL {
  return sql`case ${interval}
    when 'week' then interval '7 days'
    when 'month' then interval '1 month'
    when 'quarter' then interval '3 months'
    when 'year' then interval '1 year'
  end`;
}

// The due date: the last note (or, with no notes, the moment the interval was
// set) plus the interval. null if the contact has no interval
function dueAtSql(lastNoteAt: SQL): SQL<Date | null> {
  // In parentheses: the result is used inside other expressions, for example now() - due
  return sql<Date | null>`(coalesce(${lastNoteAt}, ${contacts.touchIntervalSetAt}) + ${touchIntervalSql(contacts.touchInterval)})`.mapWith(
    contacts.touchIntervalSetAt,
  );
}

// Whole days since the due date; 0 while less than a day has passed (or there is
// no due date), negative before it
function overdueDaysSql(dueAt: SQL): SQL<number> {
  return sql<number>`coalesce(floor(extract(epoch from now() - ${dueAt}) / 86400)::int, 0)`;
}

// How a contact stands with its "keep in touch" interval. The time comes from
// the database (now()), so the whole app has one clock
export type TouchStatus = {
  touchInterval: TouchInterval | null;
  // null if the contact has no interval
  dueAt: Date | null;
  // Whole days past the due date; 0 or less while the date has not come or just came
  overdueDays: number;
};

export async function getTouchStatus(contactId: number): Promise<TouchStatus> {
  const lastNoteAt = sql`(select max(${notes.createdAt}) from ${notes} where ${notes.contactId} = ${contacts.id})`;
  const dueAt = dueAtSql(lastNoteAt);
  const [row] = await db
    .select({
      touchInterval: contacts.touchInterval,
      dueAt,
      overdueDays: overdueDaysSql(dueAt),
    })
    .from(contacts)
    .where(eq(contacts.id, contactId));
  return row ?? { touchInterval: null, dueAt: null, overdueDays: 0 };
}

// Sets (or, with null, clears) how often to talk to a contact.
// Choosing the same interval again does not restart the countdown.
// Returns false if there is no such contact (deleted in another tab)
export async function updateTouchInterval(
  id: number,
  interval: TouchInterval | null,
): Promise<boolean> {
  const updated = await db
    .update(contacts)
    .set({
      touchInterval: interval,
      touchIntervalSetAt:
        interval === null
          ? null
          : sql`case when ${contacts.touchInterval} is distinct from ${interval}::touch_interval then now() else ${contacts.touchIntervalSetAt} end`,
      updatedAt: sql`now()`,
    })
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length > 0;
}

export type DueContact = {
  id: number;
  name: string;
  touchInterval: TouchInterval;
  dueAt: Date;
  // Whole days past the due date; 0 while less than a day has passed
  overdueDays: number;
};

// Contacts whose due date has come, the most overdue (the earliest due date)
// first; contacts with the same due date go by name, as in the list
export async function listDueContacts(): Promise<DueContact[]> {
  // The last note of each contact: one row per contact, even with no notes
  const lastNote = db
    .select({
      last_note_at: sql<Date | null>`max(${notes.createdAt})`.as("last_note_at"),
    })
    .from(notes)
    .where(eq(notes.contactId, contacts.id))
    .as("last_note");

  const dueAt = dueAtSql(sql`${lastNote.last_note_at}`);
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      touchInterval: contacts.touchInterval,
      dueAt,
      overdueDays: overdueDaysSql(dueAt),
    })
    .from(contacts)
    .leftJoinLateral(lastNote, sql`true`)
    .where(and(isNotNull(contacts.touchInterval), sql`${dueAt} <= now()`))
    .orderBy(asc(dueAt), sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));

  // The condition above guarantees an interval and a due date
  return rows.flatMap((row) =>
    row.touchInterval && row.dueAt
      ? [{ ...row, touchInterval: row.touchInterval, dueAt: row.dueAt }]
      : [],
  );
}
