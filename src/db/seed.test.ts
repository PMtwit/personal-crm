import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";

import { seedDatabase } from "../../scripts/seed-database.ts";
import { createContact, createUser } from "../../test/helpers";

describe("Демо-данные у владельца", () => {
  it("Заполнил пустую базу демо-данными", async () => {
    const result = await seedDatabase(db, "  Owner@Example.com ", 40);

    expect(result).toMatchObject({ added: true, contacts: 40 });
    // The owner is made if there was none: the email is cleaned
    const [owner] = await db.select().from(users);
    expect(owner.email).toBe("owner@example.com");
    // Everything belongs to the owner
    const allContacts = await db.select().from(contacts);
    const allGroups = await db.select().from(groups);
    expect(allContacts).toHaveLength(40);
    expect(allGroups.length).toBeGreaterThan(0);
    expect(new Set(allContacts.map((row) => row.userId))).toEqual(
      new Set([owner.id]),
    );
    expect(new Set(allGroups.map((row) => row.userId))).toEqual(
      new Set([owner.id]),
    );
    // Notes and members came with the contacts
    expect((await db.select().from(notes)).length).toBeGreaterThan(0);
    expect((await db.select().from(contactGroups)).length).toBeGreaterThan(0);
  });

  it("Владелец уже есть: данные у него, второго не создаётся", async () => {
    const existing = await createUser("owner@example.com");

    await seedDatabase(db, "owner@example.com", 10);

    expect(await db.select().from(users)).toHaveLength(1);
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, existing));
    expect(rows).toHaveLength(10);
  });

  it("В базе уже есть контакты: ничего не добавляется", async () => {
    const someone = await createUser("someone@example.com");
    await createContact(someone, "Анна");

    const result = await seedDatabase(db, "owner@example.com", 10);

    expect(result).toEqual({ added: false, existing: 1 });
    expect(await db.select().from(contacts)).toHaveLength(1);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
