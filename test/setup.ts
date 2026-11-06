import { sql } from "drizzle-orm";
import { afterAll, beforeEach, vi } from "vitest";

import { db } from "@/db";

import { assertTestDatabase } from "../e2e/test-database";
import { requestCookies, requestHeaders, resetRequestHeaders } from "./request";

// revalidatePath only works inside a Next.js request, outside it throws.
// The page refresh is not what unit tests check, so only this call is replaced:
// the app code and the database stay real
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// headers() and cookies() only work inside a Next.js request. Tests have their
// own request (test/request.ts): nobody is logged in until a test calls
// signInAs. Better Auth, the database and the app code stay real
vi.mock("next/headers", () => ({
  headers: requestHeaders,
  cookies: requestCookies,
}));

// Every test starts with empty tables and nobody logged in
beforeEach(async () => {
  resetRequestHeaders();
  assertTestDatabase(process.env.DATABASE_URL ?? "");
  const { rows } = await db.execute<{ name: string }>(
    sql`select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  );
  if (rows.length > 0) {
    const tables = rows.map((row) => row.name).join(", ");
    await db.execute(
      sql.raw(`truncate table ${tables} restart identity cascade`),
    );
  }
});

afterAll(async () => {
  await db.$client.end();
});
