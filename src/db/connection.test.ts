import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts } from "@/db/schema";

import { createOwner } from "../../test/helpers";

describe("test database", () => {
  it("is a separate database that tests may clear", async () => {
    const result = await db.execute(sql`select current_database() as name`);
    expect(result.rows[0].name).toMatch(/_unit_test$/);
  });

  it("has the schema from migrations and starts every test empty", async () => {
    const owner = await createOwner();
    await db.insert(contacts).values({ userId: owner, name: "Проверка базы" });
    const rows = await db.select().from(contacts);
    expect(rows).toHaveLength(1);
  });

  it("is empty again in the next test", async () => {
    const rows = await db.select().from(contacts);
    expect(rows).toHaveLength(0);
  });
});

describe("connection pool", () => {
  // Stuck requests may take every connection. A query must not wait for a free
  // one forever: after 10 seconds it fails, and the app keeps going by itself
  // once the connections come back
  it("fails a query after 10 seconds when every connection is busy", async () => {
    const pool = db.$client;
    const busy = await Promise.all(
      Array.from({ length: pool.options.max }, () => pool.connect()),
    );
    // The connections come back whatever happens: the next tests need them
    const releaseAll = () => {
      for (const client of busy.splice(0)) {
        client.release();
      }
    };
    const guard = setTimeout(releaseAll, 15_000);
    try {
      const started = Date.now();
      const failure = await db.execute(sql`select 1`).then(
        () => null,
        (error: unknown) => error,
      );
      const waited = Date.now() - started;

      expect(failure, "the query got no error").toBeInstanceOf(Error);
      expect((failure as Error).message).toContain(
        "timeout exceeded when trying to connect",
      );
      expect(waited).toBeGreaterThanOrEqual(9_500);
      expect(waited).toBeLessThan(12_000);
    } finally {
      clearTimeout(guard);
      releaseAll();
    }
  }, 20_000);
});
