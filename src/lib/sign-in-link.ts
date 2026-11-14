import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";

import { db } from "@/db";
import { verifications } from "@/db/schema";
import { sendSignInEmail } from "@/lib/mail";

// The library keeps a login link as a row with the identifier
// "magic-link:<hash of the token>" and the email inside its JSON value

// The hash of the token from the link: SHA-256 in base64url, the same as the
// library's own "hashed" option, so links sent before this code still work.
// It is ours so that the code below can find the row of a link by its token
export async function hashLinkToken(token: string): Promise<string> {
  return createHash("sha256").update(token).digest("base64url");
}

// The link rows of one email. The identifier is checked inside CASE: only
// such rows are read as JSON
const linkOfEmail = (email: string) =>
  sql`case when ${verifications.identifier} like 'magic-link:%' then ${verifications.value}::jsonb ->> 'email' end = ${email}`;

// Sends the letter with a new login link. The library calls it right after it
// has saved the link; no database connection is held while the letter goes.
// Sent: the links of this email made before this one stop working.
// Not sent: only this link is dropped, the earlier ones keep working
export async function deliverSignInLink({
  email,
  url,
  token,
}: {
  email: string;
  url: string;
  token: string;
}): Promise<void> {
  const identifier = `magic-link:${await hashLinkToken(token)}`;

  try {
    await sendSignInEmail(email, url);
  } catch (error) {
    await db
      .delete(verifications)
      .where(eq(verifications.identifier, identifier));
    throw error;
  }

  // If this link is gone already (a newer request has cancelled it), the
  // subquery is empty and nothing is deleted: the newer request did the job
  const own = alias(verifications, "own");
  await db
    .delete(verifications)
    .where(
      and(
        linkOfEmail(email),
        lt(
          verifications.createdAt,
          db
            .select({ createdAt: own.createdAt })
            .from(own)
            .where(eq(own.identifier, identifier)),
        ),
      ),
    );
}
