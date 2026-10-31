import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts } from "@/db/schema";

describe("test database", () => {
  it("is a separate database that tests may clear", async () => {
    const result = await db.execute(sql`select current_database() as name`);
    expect(result.rows[0].name).toMatch(/_unit_test$/);
  });

  it("has the schema from migrations and starts every test empty", async () => {
    await db.insert(contacts).values({ name: "Проверка базы" });
    const rows = await db.select().from(contacts);
    expect(rows).toHaveLength(1);
  });

  it("is empty again in the next test", async () => {
    const rows = await db.select().from(contacts);
    expect(rows).toHaveLength(0);
  });
});
