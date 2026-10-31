import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import { contacts, notes } from "../src/db/schema";
import { generateContacts, toContactRow } from "../scripts/seed-data";
import { databaseName, testDatabaseUrl } from "./test-database";

export const SEEDED_CONTACTS = 30;

// Recreates the test database contents before every run:
// schema from migrations + a small set of seed contacts
export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const testUrl = testDatabaseUrl();
  const testName = databaseName(testUrl);
  if (!testName.endsWith("_test")) {
    throw new Error(`Refusing to reset "${testName}": not a test database`);
  }

  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    const existing = await admin.query(
      "select 1 from pg_database where datname = $1",
      [testName],
    );
    if (existing.rowCount === 0) {
      await admin.query(`create database "${testName.replaceAll('"', '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: testUrl });
  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`truncate table ${notes}, ${contacts} restart identity`);
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
