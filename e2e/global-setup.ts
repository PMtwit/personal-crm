import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { contacts, users } from "../src/db/schema";
import { generateContacts, toContactRow } from "../scripts/seed-data";
import {
  prepareTestDatabase,
  TEST_OWNER_EMAIL,
  testDatabaseUrl,
} from "./test-database";

export const SEEDED_CONTACTS = 30;

// Recreates the test database contents before every run:
// schema from migrations + the test owner with a small set of seed contacts.
// The owner is logged in by the "setup" project of Playwright (auth.setup.ts)
export default async function globalSetup() {
  const testUrl = testDatabaseUrl();
  await prepareTestDatabase(testUrl);

  const pool = new Pool({ connectionString: testUrl });
  try {
    const db = drizzle({ client: pool });
    // Every table of the app: cascade clears the ones that point to users and
    // contacts, so nobody is logged in and no login link or letter count is left
    await db.execute(
      sql`truncate table users, sessions, accounts, verifications, sign_in_emails, contacts, notes, groups, contact_groups restart identity cascade`,
    );
    const [owner] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        name: "",
        email: TEST_OWNER_EMAIL,
        emailVerified: true,
      })
      .returning({ id: users.id });
    const seed = generateContacts(SEEDED_CONTACTS);
    // Without intervals, so that the "Time to get in touch" block is empty
    // at the start and every test sets up its own contacts
    await db.insert(contacts).values(
      seed.map((contact) => ({
        ...toContactRow(contact),
        userId: owner.id,
        touchInterval: null,
        touchIntervalSetAt: null,
      })),
    );
  } finally {
    await pool.end();
  }
}
