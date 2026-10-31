import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

// Tests use their own databases next to the main one, so they never touch
// real contacts. The name is "<name>_<suffix>" and always ends with "_test":
// "<name>_test" for Playwright, "<name>_unit_test" for Vitest.
// Each runner has its own database, so their runs never get in each other's way
export function testDatabaseUrl(suffix = "test"): string {
  if (suffix !== "test" && !suffix.endsWith("_test")) {
    throw new Error(`Test database suffix "${suffix}" must end with "_test"`);
  }
  loadEnvConfig(process.cwd());
  const mainUrl = process.env.DATABASE_URL;
  if (!mainUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const url = new URL(mainUrl);
  url.pathname = `${url.pathname.replace(/^\//, "")}_${suffix}`;
  return url.toString();
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

// Throws unless the database is a test one: a guard before anything
// that clears tables
export function assertTestDatabase(url: string): void {
  const name = databaseName(url);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}": not a test database`);
  }
}

// Creates the test database if it is missing and brings its schema up to date
// with the migrations. The database is created through the main one
export async function prepareTestDatabase(testUrl: string): Promise<void> {
  assertTestDatabase(testUrl);
  const testName = databaseName(testUrl);

  loadEnvConfig(process.cwd());
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
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
