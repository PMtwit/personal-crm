import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";

// Helpers that put test data straight into the database, without the app code
// under test, so that a test does not depend on the code it is checking

export async function createContact(name: string): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values({ name })
    .returning({ id: contacts.id });
  return row.id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

// A contact with a "keep in touch" interval. The dates are in the past, set
// straight in the database: how many days ago the interval was chosen and
// when the notes were written. The due date comes from the last note, or, with
// no notes, from the moment the interval was chosen
export async function createContactWithInterval(
  name: string,
  options: {
    interval: "week" | "month" | "quarter" | "year";
    setDaysAgo: number;
    noteDaysAgo?: number[];
  },
): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values({
      name,
      touchInterval: options.interval,
      touchIntervalSetAt: daysAgo(options.setDaysAgo),
    })
    .returning({ id: contacts.id });
  for (const days of options.noteDaysAgo ?? []) {
    await db.insert(notes).values({
      contactId: row.id,
      body: "Старая заметка",
      createdAt: daysAgo(days),
    });
  }
  return row.id;
}

export async function createGroup(name: string): Promise<number> {
  const [row] = await db
    .insert(groups)
    .values({ name })
    .returning({ id: groups.id });
  return row.id;
}

export async function addToGroup(contactId: number, groupId: number) {
  await db.insert(contactGroups).values({ contactId, groupId });
}

// A form as the browser sends it
export function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}
