import { eq } from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";
import { auth } from "@/lib/auth";

import { setRequestHeaders } from "./request";

// Helpers that put test data straight into the database, without the app code
// under test, so that a test does not depend on the code it is checking

// A user, as if they had already logged in once. The email is stored the way
// the app stores it: without spaces, in lower case
export async function createUser(email: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name: "",
      email: email.trim().toLowerCase(),
      emailVerified: true,
    })
    .returning({ id: users.id });
  return row.id;
}

// Better Auth signs the session cookie: "<token>.<HMAC-SHA256 of the token, base64>"
async function signedCookieValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  const base64 = Buffer.from(signature).toString("base64");
  return encodeURIComponent(`${value}.${base64}`);
}

// Logs the person in: a real user (made if there is none) and a real session
// made by Better Auth. From now on the server code of the test sees the
// request with their session cookie, as in a browser. Returns the user's id.
// Calling it again with another email switches to that person
export async function signInAs(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized));
  const userId = existing?.id ?? (await createUser(normalized));

  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const cookie = await signedCookieValue(session.token, context.secret);
  setRequestHeaders(
    new Headers({
      cookie: `${context.authCookies.sessionToken.name}=${cookie}`,
    }),
  );
  return userId;
}

// The first user and, in most tests, the only one: the one who owns the data
export const OWNER_EMAIL = "owner@example.com";

export function createOwner(): Promise<string> {
  return createUser(OWNER_EMAIL);
}

export async function createContact(
  userId: string,
  name: string,
): Promise<number> {
  const [row] = await db
    .insert(contacts)
    .values({ userId, name })
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
  userId: string,
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
      userId,
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

export async function createGroup(
  userId: string,
  name: string,
): Promise<number> {
  const [row] = await db
    .insert(groups)
    .values({ userId, name })
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

// Opens a login link as the browser does: the library answers with a redirect.
// Returns where it leads, and who is logged in by the cookie it set (null if
// nobody: a used, expired or cancelled link logs nobody in)
export async function openLoginLink(
  url: string,
): Promise<{ location: string; userId: string | null }> {
  const response = await auth.handler(new Request(url, { redirect: "manual" }));
  const cookie = response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
  const session = cookie
    ? await auth.api.getSession({ headers: new Headers({ cookie }) })
    : null;
  return {
    location: response.headers.get("location") ?? "",
    userId: session?.user.id ?? null,
  };
}
