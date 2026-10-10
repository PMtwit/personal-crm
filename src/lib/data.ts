import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
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
