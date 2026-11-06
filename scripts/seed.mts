// Fills an empty database with demo contacts for the owner: pnpm db:seed
// The owner is the user with the email from OWNER_EMAIL (the same setting the
// migrations use). Never deletes or changes existing data: if any contact
// exists, it stops.
// An ES module (.mts) both for tsx and for plain Node, which runs it in the app
// image: there local imports need the .ts extension.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { seedDatabase } from "./seed-database.ts";

const CONTACT_COUNT = 1000;

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    throw new Error(
      "OWNER_EMAIL is not set: the demo data needs an owner. Add it to .env.",
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await seedDatabase(
      drizzle({ client: pool }),
      ownerEmail,
      CONTACT_COUNT,
    );
    if (!result.added) {
      console.log(
        `The database already has ${result.existing} contacts, nothing was added. ` +
          "The seed only fills an empty database.",
      );
      return;
    }
    console.log(
      `Added ${result.contacts} contacts, ${result.notes} notes and ${result.groups} groups.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
