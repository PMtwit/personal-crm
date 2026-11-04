import { inspect } from "node:util";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, groups } from "@/db/schema";
import {
  createGroupForContact,
  insertContact,
  insertNote,
  listContacts,
  renameGroup,
  updateContact,
} from "@/lib/data";

import { createContact, createGroup } from "../../test/helpers";

// Real failures on the real test database: a failed query must not carry what
// the owner wrote about people into the logs. Next.js prints an uncaught error
// with console.error, so the check looks at everything that call can show:
// the text, the stack, every field and the nested causes

const CONTACT = {
  name: "Тайное Имя",
  about: "Тайное кто это",
  howWeMet: "Тайное откуда знакомы",
  phone: "+7 999 000-11-22",
  email: "tainoe@example.test",
};

// Postgres refuses a text with this character, whatever the column
const NUL = "\u0000";

async function failureOf(action: () => Promise<unknown>): Promise<Error> {
  try {
    await action();
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the query to fail");
}

function everythingLogsCanPrint(error: Error): string {
  return [
    String(error),
    error.stack ?? "",
    inspect(error, { depth: null, showHidden: true }),
  ]
    .join("\n")
    .toLowerCase();
}

function expectNoneOf(error: Error, values: string[]) {
  const printed = everythingLogsCanPrint(error);
  for (const value of values) {
    expect(printed).not.toContain(value.toLowerCase());
  }
}

describe("A failed query keeps personal data out of the error", () => {
  it("adding a contact: name, phone, email, about and how we met", async () => {
    const error = await failureOf(() =>
      insertContact({ ...CONTACT, name: `${CONTACT.name}${NUL}` }),
    );

    expectNoneOf(error, Object.values(CONTACT));
  });

  it("Postgres quoting the whole row in its answer", async () => {
    // A not-null failure: the database answers "Failing row contains (...)"
    const error = await failureOf(() =>
      insertContact({ ...CONTACT, name: null as unknown as string }),
    );

    expectNoneOf(error, Object.values(CONTACT));
  });

  it("changing a contact", async () => {
    const id = await createContact("Анна");

    const error = await failureOf(() =>
      updateContact(id, { ...CONTACT, phone: `${CONTACT.phone}${NUL}` }),
    );

    expectNoneOf(error, Object.values(CONTACT));
  });

  it("a note", async () => {
    const id = await createContact("Анна");
    const body = "Тайная заметка";

    const error = await failureOf(() => insertNote(id, `${body}${NUL}`));

    expectNoneOf(error, [body]);
  });

  it("a search query", async () => {
    const term = "Тайнопоиск";

    const error = await failureOf(() => listContacts(`${term}${NUL}`));

    expectNoneOf(error, [term]);
  });

  it("a group's name inside a transaction", async () => {
    const id = await createContact("Анна");
    const name = "Тайная группа";

    const error = await failureOf(() =>
      createGroupForContact(id, `${name}${NUL}`),
    );

    expectNoneOf(error, [name]);
  });

  it("a group's name Postgres quotes when the name is taken", async () => {
    await createGroup("Тайная группа");

    // Straight to the table: the app's own code handles a taken name
    const error = await failureOf(() =>
      db.insert(groups).values({ name: "тайная группа" }),
    );

    expectNoneOf(error, ["Тайная группа"]);
  });

  it("the database being unreachable", async () => {
    const pool = new Pool({
      connectionString: "postgres://nobody:nothing@127.0.0.1:1/none",
    });
    try {
      const error = await failureOf(() =>
        drizzle({ client: pool }).insert(contacts).values(CONTACT),
      );

      expectNoneOf(error, Object.values(CONTACT));
      expect(error).toMatchObject({ code: "ECONNREFUSED" });
    } finally {
      await pool.end();
    }
  });
});

describe("A failed query still says what went wrong", () => {
  it("the query without its values, the error's code, the table and the column", async () => {
    const error = await failureOf(() =>
      insertContact({ ...CONTACT, name: null as unknown as string }),
    );

    expect(error.message).toContain('insert into "contacts"');
    expect(error.message).toContain("$1");
    expect(error.message).toContain("23502");
    expect(error).toMatchObject({
      code: "23502",
      table: "contacts",
      column: "name",
    });
  });

  it("the name of the broken constraint", async () => {
    await createGroup("Семья");

    const error = await failureOf(() =>
      db.insert(groups).values({ name: "семья" }),
    );

    expect(error.message).toContain("groups_name_lower_idx");
    expect(error).toMatchObject({
      code: "23505",
      table: "groups",
      constraint: "groups_name_lower_idx",
    });
  });

  it("the stack shows which function of the app failed", async () => {
    const error = await failureOf(() =>
      insertContact({ ...CONTACT, name: null as unknown as string }),
    );

    expect(error.stack).toContain("insertContact");
  });

  it("the app can still tell a taken name from other failures", async () => {
    await createGroup("Семья");
    const friends = await createGroup("Друзья");

    expect(await renameGroup(friends, "семья")).toBe("duplicate");
  });
});
