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
import { runMigrations } from "../../scripts/run-migrations.ts";

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

// A copy of the migrations folder with only the first migrations of the list:
// the schema the app had at some moment in the past
async function folderWithMigrations(count: number): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "personal-crm-migrations-"));
  const journal = JSON.parse(
    await readFile(
      path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
      "utf8",
    ),
  ) as { entries: { tag: string }[] };
  const entries = journal.entries.slice(0, count);
  expect(entries.map((entry) => entry.tag)).toEqual(
    ["0000_init", "0001_touch_interval", "0002_groups"].slice(0, count),
  );

  await mkdir(path.join(folder, "meta"));
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await copyFile(
      path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }
  return folder;
}

async function migrateTo(pool: Pool, migrationsFolder: string): Promise<void> {
  await migrate(drizzle({ client: pool }), { migrationsFolder });
}

describe("Частота задаётся в карточке", () => {
  it("Старые контакты после обновления", async () => {
    const url = migrationDatabaseUrl();
    await recreateDatabase(url, true);
    const oldMigrations = await folderWithMigrations(1);
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

      // The update: all migrations, as on deploy. The people get an owner
      await runMigrations(url, "owner@example.com");
      const {
        rows: [owner],
      } = await pool.query<{ id: string }>(
        "select id from users where email = 'owner@example.com'",
      );

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
          user_id: owner.id,
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

// A database as it was before login: contacts, notes, groups and who is in them
async function fillOldDatabase(pool: Pool): Promise<void> {
  await pool.query(
    `insert into contacts (name, about, phone)
     select 'Контакт ' || n, 'О человеке ' || n, '+7 900 ' || n from generate_series(1, 1000) n`,
  );
  await pool.query(
    `insert into notes (contact_id, body)
     select c.id, 'Заметка ' || n from contacts c cross join generate_series(1, 5) n
     where c.id <= 500`,
  );
  await pool.query(
    `insert into groups (name) values ('Семья'), ('Друзья'), ('Знакомые'), ('Дача'), ('Аналитики')`,
  );
  await pool.query(
    `insert into contact_groups (contact_id, group_id)
     select c.id, g.id from contacts c join groups g on g.id = (c.id % 5) + 1`,
  );
  await pool.query(
    `insert into contact_groups (contact_id, group_id)
     select c.id, 1 from contacts c where c.id % 5 <> 0 and c.id <= 100`,
  );
}

async function snapshot(pool: Pool) {
  const read = async (table: string, order: string) =>
    (await pool.query(`select * from ${table} order by ${order}`)).rows;
  return {
    contacts: await read("contacts", "id"),
    notes: await read("notes", "id"),
    groups: await read("groups", "id"),
    contactGroups: await read("contact_groups", "contact_id, group_id"),
  };
}

describe("Существующие данные переходят к владельцу", () => {
  // Each test builds its own old database in a throwaway one, as on deploy
  async function withOldDatabase(
    body: (pool: Pool, url: string) => Promise<void>,
    options: { withData: boolean } = { withData: true },
  ) {
    const url = migrationDatabaseUrl();
    await recreateDatabase(url, true);
    const oldMigrations = await folderWithMigrations(3);
    const pool = new Pool({ connectionString: url });
    try {
      await migrateTo(pool, oldMigrations);
      if (options.withData) {
        await fillOldDatabase(pool);
      }
      await body(pool, url);
    } finally {
      await pool.end();
      await rm(oldMigrations, { recursive: true, force: true });
      await recreateDatabase(url, false);
    }
  }

  it("Обновление с данными", async () => {
    await withOldDatabase(async (pool, url) => {
      const before = await snapshot(pool);
      expect(before.contacts).toHaveLength(1000);
      expect(before.notes).toHaveLength(2500);
      expect(before.groups).toHaveLength(5);

      // The address has spaces and capitals: it is stored cleaned
      await runMigrations(url, "  Owner@Example.COM ");

      const after = await snapshot(pool);
      const {
        rows: [owner],
      } = await pool.query<{ id: string }>(
        "select id from users where email = 'owner@example.com'",
      );
      expect(owner).toBeDefined();
      const { rows: allUsers } = await pool.query("select id from users");
      expect(allUsers).toHaveLength(1);

      // The same number of rows, the same fields; only the owner is new
      expect(after.contacts).toHaveLength(1000);
      expect(after.groups).toHaveLength(5);
      expect(after.notes).toEqual(before.notes);
      expect(after.contactGroups).toEqual(before.contactGroups);
      const withoutOwner = ({
        user_id,
        ...fields
      }: Record<string, unknown>) => {
        expect(user_id).toBe(owner.id);
        return fields;
      };
      expect(after.contacts.map(withoutOwner)).toEqual(before.contacts);
      expect(after.groups.map(withoutOwner)).toEqual(before.groups);
    });
  });

  it("Почта владельца не задана", async () => {
    await withOldDatabase(async (pool, url) => {
      const before = await snapshot(pool);

      await expect(runMigrations(url, undefined)).rejects.toThrow(
        /OWNER_EMAIL/,
      );

      // Nothing changed: no new tables, no owner column, the same data
      const {
        rows: [tables],
      } = await pool.query(
        "select to_regclass('public.users') is not null as users, to_regclass('public.sessions') is not null as sessions",
      );
      expect(tables).toEqual({ users: false, sessions: false });
      expect(await snapshot(pool)).toEqual(before);
      const { rows: applied } = await pool.query(
        "select count(*)::int as total from drizzle.__drizzle_migrations",
      );
      expect(applied[0].total).toBe(3);
    });
  });

  it("Пустая база", async () => {
    await withOldDatabase(
      async (pool, url) => {
        await runMigrations(url, undefined);

        const { rows } = await pool.query("select id from users");
        expect(rows).toEqual([]);
      },
      { withData: false },
    );
  });

  it("Почта владельца не похожа на почту", async () => {
    await withOldDatabase(async (pool, url) => {
      const before = await snapshot(pool);

      await expect(runMigrations(url, "не-почта")).rejects.toThrow(
        /OWNER_EMAIL/,
      );

      expect(await snapshot(pool)).toEqual(before);
    });
  });
});
