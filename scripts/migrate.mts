// Applies new migrations from ./drizzle and exits. The deploy runs it on the
// server as a one-off container from the app image, before the new app starts.
// Runs with plain Node, which strips the types itself: node scripts/migrate.mts
import nextEnv from "@next/env";
import { Pool } from "pg";

import { runMigrations } from "./run-migrations.ts";

// How many migrations drizzle has recorded as applied
async function appliedCount(pool: Pool): Promise<number> {
  const {
    rows: [table],
  } = await pool.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as found",
  );
  if (!table.found) {
    return 0;
  }
  const {
    rows: [row],
  } = await pool.query(
    "select count(*)::int as total from drizzle.__drizzle_migrations",
  );
  return row.total;
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  // The owner of the data that exists before login. Needed only while the
  // database has contacts or groups without an owner: then migration 0003
  // stops with an error if it is missing
  const ownerEmail = process.env.OWNER_EMAIL;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const before = await appliedCount(pool);
    await runMigrations(process.env.DATABASE_URL, ownerEmail);
    const after = await appliedCount(pool);
    console.log(
      `Migrations: ${after - before} applied now, ${after} in total.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
