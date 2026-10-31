import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { describe, expect, it } from "vitest";

import { assertTestDatabase, databaseName } from "../../e2e/test-database";

// An update of the app as it happens on deploy: a database made before
// "keep in touch" gets the new migrations on top of its data.
// It runs in its own throwaway database "<name>_migration_test", not in the
// unit test one: that one is already fully migrated

const MIGRATIONS_FOLDER = "drizzle";

function migrationDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const base = databaseName(url.toString()).replace(/_unit_test$/, "");
  url.pathname = `/${encodeURIComponent(`${base}_migration_test`)}`;
  return url.toString();
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// Created and dropped through the unit test database: Postgres cannot drop
// the database a connection is open to
async function recreateDatabase(url: string, create: boolean): Promise<void> {
  assertTestDatabase(url);
  const name = quoteIdentifier(databaseName(url));
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${name} with (force)`);
    if (create) {
      await admin.query(`create database ${name}`);
    }
  } finally {
    await admin.end();
  }
}

// A copy of the migrations folder with only the first migration in the list:
// the schema the app had before "keep in touch"
async function folderWithFirstMigration(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "personal-crm-migrations-"));
  const journal = JSON.parse(
    await readFile(
      path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
      "utf8",
    ),
  ) as { entries: { tag: string }[] };
  const [first] = journal.entries;
  expect(first.tag).toBe("0000_init");

  await mkdir(path.join(folder, "meta"));
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: [first] }),
  );
  await copyFile(
    path.join(MIGRATIONS_FOLDER, `${first.tag}.sql`),
    path.join(folder, `${first.tag}.sql`),
  );
  return folder;
}

async function migrateTo(pool: Pool, migrationsFolder: string): Promise<void> {
  await migrate(drizzle({ client: pool }), { migrationsFolder });
}

describe("Частота задаётся в карточке", () => {
  it("Старые контакты после обновления", async () => {
    const url = migrationDatabaseUrl();
    await recreateDatabase(url, true);
    const oldMigrations = await folderWithFirstMigration();
    const pool = new Pool({ connectionString: url });
    try {
      // The app before "keep in touch", with people and notes in it
      await migrateTo(pool, oldMigrations);
      const { rows: people } = await pool.query<{ id: number }>(
        `insert into contacts (name, about, how_we_met, phone, email, created_at, updated_at)
         values
           ('Анна Смирнова', 'Любит горы', 'Учились вместе', '+7 900 000-00-00',
            'anna@example.com', '2026-01-10T09:00:00Z', '2026-02-01T10:00:00Z'),
           ('Борис', null, null, null, null,
            '2026-03-05T12:00:00Z', '2026-03-05T12:00:00Z')
         returning id`,
      );
      await pool.query(
        `insert into notes (contact_id, body, created_at)
         values ($1, 'Созвонились', '2026-02-01T10:00:00Z'),
                ($1, 'Поздравил с днём рождения', '2026-04-12T18:30:00Z')`,
        [people[0].id],
      );
      const contactsBefore = await pool.query(
        "select * from contacts order by id",
      );
      const notesBefore = await pool.query("select * from notes order by id");

      // The update: all migrations, as on deploy
      await migrateTo(pool, MIGRATIONS_FOLDER);

      // Every old contact has no interval, which the card shows as "Не задано";
      // everything else about them and their notes is as it was
      const contactsAfter = await pool.query(
        "select * from contacts order by id",
      );
      expect(contactsAfter.rows).toEqual(
        contactsBefore.rows.map((contact) => ({
          ...contact,
          touch_interval: null,
          touch_interval_set_at: null,
        })),
      );
      const notesAfter = await pool.query("select * from notes order by id");
      expect(notesAfter.rows).toHaveLength(2);
      expect(notesAfter.rows).toEqual(notesBefore.rows);
    } finally {
      await pool.end();
      await rm(oldMigrations, { recursive: true, force: true });
      await recreateDatabase(url, false);
    }
  });
});
