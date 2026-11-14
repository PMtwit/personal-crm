import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { signInEmails } from "@/db/schema";
import { auth } from "@/lib/auth";

// No more than 3 letters to one email within 10 minutes
const LETTER_LIMIT = 3;
const LIMIT_WINDOW = "10 minutes";

const emailSchema = z.email();

export type SignInResult =
  | { sentTo: string }
  | { error: "invalid-email" | "rate-limited" | "send-failed" };

// Asks for a login link. This is the only way to get one: the library's own
// address for it is closed (disabledPaths in auth.ts), so the checks below
// cannot be bypassed by a direct request.
//
// 1. The email is cleaned (no spaces, lower case) and checked on the server.
// 2. The letter is counted before it is sent, if the limit allows (countLetter).
//    3 letters in the last 10 minutes: refused, the old links stay alive.
// 3. The library makes a new link and sends it (deliverSignInLink in
//    sign-in-link.ts cancels the old links or drops the new one).
// 4. The letter was not sent: it is not counted any more.
// No database connection is held while the letter goes: many requests at once
// or a slow mail service do not take the connections the rest of the app needs.
// The answer does not depend on whether such a person exists
export async function requestSignInLink(
  rawEmail: string,
  headers: Headers,
): Promise<SignInResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    return { error: "invalid-email" };
  }

  const letter = await countLetter(email);
  if (letter === null) {
    return { error: "rate-limited" };
  }

  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: "/",
        errorCallbackURL: "/login/expired",
      },
      headers,
    });
  } catch {
    // Only the fact is logged: no address, no link, no reason that may carry them
    console.error("The login letter was not sent");
    await db.delete(signInEmails).where(eq(signInEmails.id, letter));
    return { error: "send-failed" };
  }

  // Counted rows older than the window are no use any more
  await db
    .delete(signInEmails)
    .where(
      and(
        eq(signInEmails.email, email),
        lt(signInEmails.createdAt, sql`now() - ${LIMIT_WINDOW}::interval`),
      ),
    );
  return { sentTo: email };
}

// Counts a letter to the email if the limit allows: returns the id of the
// counted row, or null when 3 letters went in the last 10 minutes.
// Requests for one email pass here one after another (a lock on the email), so
// two at the same moment cannot get past the limit. The lock and the database
// connection are held only for these few queries, never while a letter is sent
async function countLetter(email: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`,
    );

    const {
      rows: [recent],
    } = await tx.execute<{ total: number }>(
      sql`select count(*)::int as total from ${signInEmails}
          where ${signInEmails.email} = ${email}
            and ${signInEmails.createdAt} > now() - ${LIMIT_WINDOW}::interval`,
    );
    if (recent.total >= LETTER_LIMIT) {
      return null;
    }

    const [counted] = await tx
      .insert(signInEmails)
      .values({ email })
      .returning({ id: signInEmails.id });
    return counted.id;
  });
}
