import { describe, expect, it } from "vitest";

import { getCurrentUser, requireUserId } from "@/lib/session";

import { signInAs } from "../../test/helpers";

describe("Сессия", () => {
  it("getCurrentUser с cookie возвращает пользователя", async () => {
    const id = await signInAs("anna@example.com");

    const user = await getCurrentUser();

    expect(user?.id).toBe(id);
    expect(user?.email).toBe("anna@example.com");
    expect(await requireUserId()).toBe(id);
  });

  it("getCurrentUser без cookie возвращает null", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("requireUserId без входа отправляет на страницу входа", async () => {
    await expect(requireUserId()).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });

  it("Просроченная сессия не считается входом", async () => {
    const { sql } = await import("drizzle-orm");
    const { db } = await import("@/db");
    await signInAs("anna@example.com");
    await db.execute(
      sql`update sessions set expires_at = now() - interval '1 minute'`,
    );

    expect(await getCurrentUser()).toBeNull();
  });
});
