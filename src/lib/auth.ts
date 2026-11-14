import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { deliverSignInLink, hashLinkToken } from "@/lib/sign-in-link";

const DAY_SECONDS = 24 * 60 * 60;

// Login by a link from a letter. No passwords, no social networks.
// Where the letters go and the secret come from the settings (.env), the code
// is the same on a computer, in CI and on the server
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
  // No usage statistics sent to the library's authors
  telemetry: { enabled: false },
  session: {
    // Login lasts 30 days from the last visit: the session is prolonged when it
    // is used, but not more often than once an hour
    expiresIn: 30 * DAY_SECONDS,
    updateAge: 60 * 60,
  },
  advanced: {
    // nginx passes the address of the visitor here; without it everyone would
    // look like one address for the library's own limit on opening links
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },
  // A link is asked for only through our own form (requestSignInLink): it
  // checks the email and counts the letters. The library's own address for it
  // is closed to requests from outside; calls from our server code still work
  disabledPaths: ["/sign-in/magic-link"],
  plugins: [
    magicLink({
      expiresIn: 15 * 60,
      // The database keeps a hash of the link, not the link: a leaked copy of
      // the database gives no working links. The hash is ours (the same as the
      // library's "hashed"): deliverSignInLink finds the row of its link by it
      storeToken: { type: "custom-hasher", hash: hashLinkToken },
      // Sends the letter, then cancels the older links of this email; if the
      // letter was not sent, drops the new link (sign-in-link.ts)
      sendMagicLink: deliverSignInLink,
    }),
    // Must be the last plugin: it passes the library's cookies to Next.js
    nextCookies(),
  ],
});
