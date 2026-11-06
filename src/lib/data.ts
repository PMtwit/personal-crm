import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import type { TouchInterval } from "@/lib/keep-in-touch";
import { escapeLike, searchTerms } from "@/lib/search";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import type { ContactInput } from "@/lib/validation";

// Every function here takes the id of the logged-in user first and works only
// with that user's contacts and groups. A contact or a group of someone else
// is "not found", the same answer as for one that does not exist: the id comes
// from the page address or a form, so it can be anyone's.
// The id of the user comes from the session (requireUserId), never from the request

export type ContactListItem = Pick<
  typeof contacts.$inferSelect,
  "id" | "name" | "about" | "phone" | "email"
>;

// The contact is in the group. exists, not a join: a contact in a group
// is one row of the list, whatever the number of its groups
function inGroup(groupId: number): SQL {
  return sql`exists (select 1 from ${contactGroups} where ${contactGroups.contactId} = ${contacts.id} and ${contactGroups.groupId} = ${groupId})`;
}

// With a group, only its contacts; null means all contacts
export async function listContacts(
  userId: string,
  query: string,
  groupId: number | null = null,
): Promise<ContactListItem[]> {
  const normalizedName = sql`replace(lower(${contacts.name}), 'ё', 'е')`;
  const conditions = [
    eq(contacts.userId, userId),
    ...searchTerms(query).map(
      (term) => sql`${normalizedName} like ${`%${escapeLike(term)}%`}`,
    ),
  ];
  if (groupId !== null) {
    conditions.push(inGroup(groupId));
  }

  return (
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        about: contacts.about,
        phone: contacts.phone,
        email: contacts.email,
      })
      .from(contacts)
      .where(and(...conditions))
      // Russian alphabetical order: "Александр Ермаков" before "Александра Белых",
      // "Ё" next to "Е" (the default collation ignores spaces)
      .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id))
  );
}

// With a group, only the contacts in it; null means all contacts
export async function countContacts(
  userId: string,
  groupId: number | null = null,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        groupId === null ? undefined : inGroup(groupId),
      ),
    );
  return row.total;
}

export async function getContact(userId: string, id: number) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
  return contact ?? null;
}

// A note belongs to the owner of its contact: the notes of someone else's
// contact are an empty list
export async function listNotes(userId: string, contactId: number) {
  return db
    .select(getTableColumns(notes))
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(and(eq(notes.contactId, contactId), eq(contacts.userId, userId)))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

export async function insertContact(
  userId: string,
  input: ContactInput,
): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values({ ...input, userId })
    .returning({ id: contacts.id });
  return row.id;
}

export async function updateContact(
  userId: string,
  id: number,
  input: ContactInput,
): Promise<boolean> {
  const updated = await db
    .update(contacts)
    .set({ ...input, updatedAt: sql`now()` })
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });
  return updated.length > 0;
}

// Returns the deleted contact's name, or null if there was no such contact.
// The contact's notes are deleted by the database: the foreign key cascades
export async function deleteContact(
  userId: string,
  id: number,
): Promise<string | null> {
  const [deleted] = await db
    .delete(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning({ name: contacts.name });
  return deleted?.name ?? null;
}

export async function insertNote(
  userId: string,
  contactId: number,
  body: string,
): Promise<boolean> {
  const contact = await getContact(userId, contactId);
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
// set) plus the interval. null if the contact has no interval.
// date_add, not "+": "+" counts months by the calendar of the database's session,
// and a note written at night in Moscow is still on the day before in UTC:
// March 1 + 1 month would come out as March 29, not April 1
function dueAtSql(lastNoteAt: SQL): SQL<Date | null> {
  return sql<Date | null>`date_add(coalesce(${lastNoteAt}, ${contacts.touchIntervalSetAt}), ${touchIntervalSql(contacts.touchInterval)}, ${APP_TIME_ZONE}::text)`.mapWith(
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

export async function getTouchStatus(
  userId: string,
  contactId: number,
): Promise<TouchStatus> {
  const lastNoteAt = sql`(select max(${notes.createdAt}) from ${notes} where ${notes.contactId} = ${contacts.id})`;
  const dueAt = dueAtSql(lastNoteAt);
  const [row] = await db
    .select({
      touchInterval: contacts.touchInterval,
      dueAt,
      overdueDays: overdueDaysSql(dueAt),
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
  return row ?? { touchInterval: null, dueAt: null, overdueDays: 0 };
}

// Sets (or, with null, clears) how often to talk to a contact.
// Choosing the same interval again does not restart the countdown.
// Returns false if there is no such contact (deleted in another tab)
export async function updateTouchInterval(
  userId: string,
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
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
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
// first; contacts with the same due date go by name, as in the list.
// With a group, only the contacts in it; null means all contacts
export async function listDueContacts(
  userId: string,
  groupId: number | null = null,
): Promise<DueContact[]> {
  // The last note of each contact: one row per contact, even with no notes
  const lastNote = db
    .select({
      last_note_at: sql<Date | null>`max(${notes.createdAt})`.as(
        "last_note_at",
      ),
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
    .where(
      and(
        eq(contacts.userId, userId),
        isNotNull(contacts.touchInterval),
        sql`${dueAt} <= now()`,
        groupId === null ? undefined : inGroup(groupId),
      ),
    )
    .orderBy(
      asc(dueAt),
      sql`${contacts.name} collate "ru-x-icu"`,
      asc(contacts.id),
    );

  // The condition above guarantees an interval and a due date
  return rows.flatMap((row) =>
    row.touchInterval && row.dueAt
      ? [{ ...row, touchInterval: row.touchInterval, dueAt: row.dueAt }]
      : [],
  );
}

export type GroupListItem = {
  id: number;
  name: string;
  contactCount: number;
};

// All groups of the user by name, in Russian alphabetical order, with the
// number of their contacts in each
export async function listGroups(userId: string): Promise<GroupListItem[]> {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: count(contacts.id),
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .leftJoin(
      contacts,
      and(
        eq(contacts.id, contactGroups.contactId),
        eq(contacts.userId, userId),
      ),
    )
    .where(eq(groups.userId, userId))
    .groupBy(groups.id)
    .orderBy(sql`${groups.name} collate "ru-x-icu"`, asc(groups.id));
}

// Ids of the groups the contact is in
export async function listContactGroupIds(
  userId: string,
  contactId: number,
): Promise<number[]> {
  const rows = await db
    .select({ groupId: contactGroups.groupId })
    .from(contactGroups)
    .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        eq(contacts.userId, userId),
        eq(groups.userId, userId),
      ),
    );
  return rows.map((row) => row.groupId);
}

export type SetContactGroupResult =
  "ok" | "contact-not-found" | "group-not-found";

// Puts the contact into the group or takes it out. Doing it again is harmless.
// Only this one group changes, so two tabs with different groups of one contact
// do not overwrite each other
export async function setContactGroup(
  userId: string,
  contactId: number,
  groupId: number,
  member: boolean,
): Promise<SetContactGroupResult> {
  return db.transaction(async (tx) => {
    // "key share" holds the rows until the end: a contact or a group deleted
    // in another tab cannot disappear between the check and the insert
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
      .for("key share");
    if (!contact) {
      return "contact-not-found";
    }
    const [group] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.userId, userId)))
      .for("key share");
    if (!group) {
      return "group-not-found";
    }

    if (member) {
      await tx
        .insert(contactGroups)
        .values({ contactId, groupId })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(contactGroups)
        .where(
          and(
            eq(contactGroups.contactId, contactId),
            eq(contactGroups.groupId, groupId),
          ),
        );
    }
    await tx
      .update(contacts)
      .set({ updatedAt: sql`now()` })
      .where(eq(contacts.id, contactId));
    return "ok";
  });
}

// Creates a group and puts the contact into it. If a group with this name
// (any letter case) already exists, no new one is made: the contact goes into
// the existing one. Returns the group's id, or null if there is no such contact
// (deleted in another tab): then no group is created either.
// Two requests at the same moment give one group: the second waits for the
// first on the unique index, then finds its group
export async function createGroupForContact(
  userId: string,
  contactId: number,
  name: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
      .for("key share");
    if (!contact) {
      return null;
    }

    // The name is unique for one user: another user may have the same one
    await tx.insert(groups).values({ userId, name }).onConflictDoNothing();
    const [group] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.userId, userId),
          sql`lower(${groups.name}) = lower(${name})`,
        ),
      )
      .for("key share");

    await tx
      .insert(contactGroups)
      .values({ contactId, groupId: group.id })
      .onConflictDoNothing();
    await tx
      .update(contacts)
      .set({ updatedAt: sql`now()` })
      .where(eq(contacts.id, contactId));
    return group.id;
  });
}

export type RenameGroupResult = "ok" | "duplicate" | "not-found";

// PostgreSQL's code for "a unique index would be broken". Drizzle wraps the
// driver's error, so the code can be in the error or in its cause
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return code === UNIQUE_VIOLATION || causeCode === UNIQUE_VIOLATION;
}

// Another group of the same user already has this name (in any letter case): "duplicate".
// The group's own name does not count: changing only the letter case works.
// No such group (deleted in another tab): "not-found"
export async function renameGroup(
  userId: string,
  id: number,
  name: string,
): Promise<RenameGroupResult> {
  try {
    const updated = await db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), eq(groups.userId, userId)))
      .returning({ id: groups.id });
    return updated.length > 0 ? "ok" : "not-found";
  } catch (error) {
    if (isUniqueViolation(error)) {
      return "duplicate";
    }
    throw error;
  }
}

// The group goes, the contacts stay: the database drops only the rows of
// "who is in the group". false if there was no such group already
export async function deleteGroup(
  userId: string,
  id: number,
): Promise<boolean> {
  const deleted = await db
    .delete(groups)
    .where(and(eq(groups.id, id), eq(groups.userId, userId)))
    .returning({ id: groups.id });
  return deleted.length > 0;
}
