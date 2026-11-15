import { createHash } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";
import { isValidBirthDate, upcomingBirthdays } from "@/lib/birthdays";

import { generateContacts } from "../../scripts/seed-data.ts";
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

describe("Демо-данные с днями рождения", () => {
  // As many as `pnpm db:seed` adds
  const seed = generateContacts(1000);
  const withDate = seed.filter((contact) => contact.birthDay !== null);

  it("about half of the contacts have a birth date, a part of them without a year", () => {
    expect(withDate.length).toBeGreaterThan(400);
    expect(withDate.length).toBeLessThan(600);
    const withoutYear = withDate.filter(
      (contact) => contact.birthYear === null,
    );
    // About a third
    expect(withoutYear.length / withDate.length).toBeGreaterThan(0.25);
    expect(withoutYear.length / withDate.length).toBeLessThan(0.42);
  });

  it("every date exists, the years are 1950-2005", () => {
    for (const contact of seed) {
      if (contact.birthDay === null || contact.birthMonth === null) {
        expect(contact).toMatchObject({
          birthDay: null,
          birthMonth: null,
          birthYear: null,
        });
        continue;
      }
      expect(
        isValidBirthDate(
          contact.birthDay,
          contact.birthMonth,
          contact.birthYear,
        ),
      ).toBe(true);
      if (contact.birthYear !== null) {
        expect(contact.birthYear).toBeGreaterThanOrEqual(1950);
        expect(contact.birthYear).toBeLessThanOrEqual(2005);
      }
    }
  });

  it("any week of the year has a few birthdays", () => {
    const rows = withDate.map((contact) => ({
      birthDay: contact.birthDay!,
      birthMonth: contact.birthMonth!,
      birthYear: contact.birthYear,
    }));
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day));
      const today = {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
      expect(upcomingBirthdays(rows, today).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("names, notes, intervals and groups are what they were", () => {
    // The fingerprint of the demo data before birthdays: the birth dates come
    // from a generator of their own and change nothing else
    const withoutBirthDates = seed.map(
      ({ birthDay, birthMonth, birthYear, ...contact }) => {
        void [birthDay, birthMonth, birthYear];
        return contact;
      },
    );
    expect(
      createHash("sha256")
        .update(JSON.stringify(withoutBirthDates))
        .digest("hex"),
    ).toBe("753bf16092ca5d286764eb18d5f5bd2e3ed9a8dda432bb6c7033ada5b0556e31");
  });

  it("the birth dates go into the database", async () => {
    await seedDatabase(db, "owner@example.com", 40);

    const rows = await db
      .select({
        name: contacts.name,
        birthDay: contacts.birthDay,
        birthMonth: contacts.birthMonth,
        birthYear: contacts.birthYear,
      })
      .from(contacts)
      .orderBy(asc(contacts.id));
    expect(rows).toEqual(
      generateContacts(40).map(({ name, birthDay, birthMonth, birthYear }) => ({
        name,
        birthDay,
        birthMonth,
        birthYear,
      })),
    );
    expect(rows.some((row) => row.birthDay !== null)).toBe(true);
  });
});
