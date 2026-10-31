import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { contactGroups, contacts, groups, notes } from "../src/db/schema";
import { generateContacts, toContactRow } from "../scripts/seed-data";
import { prepareTestDatabase, testDatabaseUrl } from "./test-database";

export const SEEDED_CONTACTS = 30;

// Recreates the test database contents before every run:
// schema from migrations + a small set of seed contacts
export default async function globalSetup() {
  const testUrl = testDatabaseUrl();
  await prepareTestDatabase(testUrl);

  const pool = new Pool({ connectionString: testUrl });
  try {
    const db = drizzle({ client: pool });
    // Every table that points to contacts is listed: truncate fails on a foreign key
    // otherwise
    await db.execute(
      sql`truncate table ${contactGroups}, ${groups}, ${notes}, ${contacts} restart identity`,
    );
    const seed = generateContacts(SEEDED_CONTACTS);
    // Without intervals, so that the "Time to get in touch" block is empty
    // at the start and every test sets up its own contacts
    await db.insert(contacts).values(
      seed.map((contact) => ({
        ...toContactRow(contact),
        touchInterval: null,
        touchIntervalSetAt: null,
      })),
    );
  } finally {
    await pool.end();
  }
}
