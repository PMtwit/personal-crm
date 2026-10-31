// Fills an empty database with test contacts: pnpm db:seed
// Never deletes or changes existing data: if any contact exists, it stops.
// An ES module (.mts) both for tsx and for plain Node, which runs it in the app
// image: there local imports need the .ts extension.
import nextEnv from "@next/env";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { contactGroups, contacts, groups, notes } from "../src/db/schema.ts";
import { generateContacts, SEED_GROUPS, toContactRow } from "./seed-data.ts";

const CONTACT_COUNT = 1000;

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  try {
    const [{ total }] = await db.select({ total: count() }).from(contacts);
    if (total > 0) {
      console.log(
        `The database already has ${total} contacts, nothing was added. ` +
          "The seed only fills an empty database.",
      );
      return;
    }

    const seed = generateContacts(CONTACT_COUNT);

    const counts = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(contacts)
        .values(seed.map(toContactRow))
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

      // The groups and who is in them: in the same transaction, so a failure
      // leaves the database empty, not half filled
      const insertedGroups = await tx
        .insert(groups)
        .values(SEED_GROUPS.map((name) => ({ name })))
        .returning({ id: groups.id, name: groups.name });
      const idByGroupName = new Map(insertedGroups.map((row) => [row.name, row.id]));
      const membershipRows = seed.flatMap((contact) =>
        contact.groups.map((group) => ({
          contactId: idByName.get(contact.name)!,
          groupId: idByGroupName.get(group)!,
        })),
      );
      if (membershipRows.length > 0) {
        await tx.insert(contactGroups).values(membershipRows);
      }
      return { notes: noteRows.length, groups: insertedGroups.length };
    });

    console.log(
      `Added ${seed.length} contacts, ${counts.notes} notes and ${counts.groups} groups.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
