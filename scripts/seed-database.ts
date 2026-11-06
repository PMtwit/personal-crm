// Fills an empty database with demo contacts, notes and groups for the owner.
// Never deletes or changes existing data: if any contact exists, it adds nothing.
// Used by scripts/seed.mts (pnpm db:seed) and by the test; local imports need
// the .ts extension because plain Node runs it in the app image.
import { count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  contactGroups,
  contacts,
  groups,
  notes,
  users,
} from "../src/db/schema.ts";
import { generateContacts, SEED_GROUPS, toContactRow } from "./seed-data.ts";

export type SeedResult =
  | { added: true; contacts: number; notes: number; groups: number }
  | { added: false; existing: number };

// The demo data belongs to the user with this email; the user is made if there
// is none. All of it goes in one transaction: a failure leaves the database empty
export async function seedDatabase(
  db: NodePgDatabase<Record<string, unknown>>,
  ownerEmail: string,
  contactCount: number,
): Promise<SeedResult> {
  const email = ownerEmail.trim().toLowerCase();

  return db.transaction(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(contacts);
    if (total > 0) {
      return { added: false, existing: total };
    }

    let [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (!owner) {
      [owner] = await tx
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          name: "",
          email,
          emailVerified: true,
        })
        .returning({ id: users.id });
    }
    const userId = owner.id;

    const seed = generateContacts(contactCount);
    const inserted = await tx
      .insert(contacts)
      .values(seed.map((contact) => ({ ...toContactRow(contact), userId })))
      .returning({ id: contacts.id, name: contacts.name });

    // Names are unique within the seed, so they link notes to new ids
    const idByName = new Map(inserted.map((row) => [row.name, row.id]));
    const noteRows = seed.flatMap((contact) =>
      contact.notes.map((note) => ({
        contactId: idByName.get(contact.name)!,
        body: note.body,
        createdAt: note.createdAt,
      })),
    );
    if (noteRows.length > 0) {
      await tx.insert(notes).values(noteRows);
    }

    const insertedGroups = await tx
      .insert(groups)
      .values(SEED_GROUPS.map((name) => ({ userId, name })))
      .returning({ id: groups.id, name: groups.name });
    const idByGroupName = new Map(
      insertedGroups.map((row) => [row.name, row.id]),
    );
    const membershipRows = seed.flatMap((contact) =>
      contact.groups.map((group) => ({
        contactId: idByName.get(contact.name)!,
        groupId: idByGroupName.get(group)!,
      })),
    );
    if (membershipRows.length > 0) {
      await tx.insert(contactGroups).values(membershipRows);
    }
    return {
      added: true,
      contacts: seed.length,
      notes: noteRows.length,
      groups: insertedGroups.length,
    };
  });
}
