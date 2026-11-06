import "server-only";

import { and, inArray, lt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { signInEmails, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";

// No more than 3 letters to one email within 10 minutes
const LETTER_LIMIT = 3;
const LIMIT_WINDOW = "10 minutes";

const emailSchema = z.email();

export type SignInResult =
  | { sentTo: string }
  | { error: "invalid-email" | "rate-limited" | "send-failed" };

// The link rows of one email. The library keeps a login link as a row with
// the identifier "magic-link:<hash>" and the email inside its JSON value.
// The identifier is checked inside CASE: only such rows are read as JSON
const linkOfEmail = (email: string) =>
  sql`case when ${verifications.identifier} like 'magic-link:%' then ${verifications.value}::jsonb ->> 'email' end = ${email}`;

// Asks for a login link. This is the only way to get one: the library's own
// address for it is closed (disabledPaths in auth.ts), so the checks below
// cannot be bypassed by a direct request.
//
// 1. The email is cleaned (no spaces, lower case) and checked on the server.
// 2. Requests for one email go one after another (a lock on the email), so
//    two at the same moment cannot get past the limit.
// 3. 3 letters in the last 10 minutes: refused, the old links stay alive.
// 4. A new link is made and sent by the library. Only then the old links of
//    this email are cancelled and the letter is counted. If the letter was
//    not sent, the new link is dropped, the old ones live and nothing is counted.
// The answer does not depend on whether such a person exists
export async function requestSignInLink(
  rawEmail: string,
  headers: Headers,
): Promise<SignInResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    return { error: "invalid-email" };
  }

  return db.transaction(async (tx): Promise<SignInResult> => {
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
      return { error: "rate-limited" };
    }

    const oldLinks = (
      await tx
        .select({ id: verifications.id })
        .from(verifications)
        .where(linkOfEmail(email))
    ).map((row) => row.id);

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
      await tx
        .delete(verifications)
        .where(
          oldLinks.length > 0
            ? and(linkOfEmail(email), notInArray(verifications.id, oldLinks))
            : linkOfEmail(email),
        );
      return { error: "send-failed" };
    }

    if (oldLinks.length > 0) {
      await tx.delete(verifications).where(inArray(verifications.id, oldLinks));
    }
    await tx.insert(signInEmails).values({ email });
    // Counted rows older than the window are no use any more
    await tx
      .delete(signInEmails)
      .where(
        and(
          sql`${signInEmails.email} = ${email}`,
          lt(signInEmails.createdAt, sql`now() - ${LIMIT_WINDOW}::interval`),
        ),
      );
    return { sentTo: email };
  });
}
