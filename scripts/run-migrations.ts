// Applies the migrations from ./drizzle to one database. Used by
// scripts/migrate.mts (the server and `pnpm db:migrate`), by the test
// databases and by the migration test: one way to migrate everywhere.
// Local imports need the .ts extension: plain Node runs this file in the app image.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Looks like an email, nothing more: the real check is a login letter
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Migration 0003 gives all existing contacts and groups to the user with this
// email. The email goes in through a setting of the one connection that runs
// the migrations, as a query parameter: nothing to escape and nothing in the
// repository, which is public. Without data it is not needed
export async function runMigrations(
  connectionString: string,
  ownerEmail: string | undefined,
  migrationsFolder = "drizzle",
): Promise<void> {
  const email = ownerEmail?.trim() ?? "";
  if (email !== "" && !EMAIL_PATTERN.test(email)) {
    throw new Error("OWNER_EMAIL is not an email address");
  }

  // A single connection, not a pool: the setting lives as long as the connection
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("select set_config('app.owner_email', $1, false)", [
      email,
    ]);
    await migrate(drizzle({ client }), { migrationsFolder });
  } finally {
    await client.end();
  }
}
