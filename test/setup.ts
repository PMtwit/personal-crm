import { sql } from "drizzle-orm";
import { afterAll, beforeEach, vi } from "vitest";

import { db } from "@/db";

import { assertTestDatabase } from "../e2e/test-database";

// revalidatePath only works inside a Next.js request, outside it throws.
// The page refresh is not what unit tests check, so only this call is replaced:
// the app code and the database stay real
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Every test starts with empty tables
beforeEach(async () => {
  assertTestDatabase(process.env.DATABASE_URL ?? "");
  const { rows } = await db.execute<{ name: string }>(
    sql`select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  );
  if (rows.length > 0) {
    const tables = rows.map((row) => row.name).join(", ");
    await db.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
  }
});

afterAll(async () => {
  await db.$client.end();
});
