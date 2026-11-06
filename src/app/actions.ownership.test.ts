import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addNoteAction,
  createContactAction,
  createGroupForContactAction,
  deleteContactAction,
  setContactGroupAction,
  setTouchIntervalAction,
  updateContactAction,
} from "@/app/actions";
import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { listContacts, listGroups } from "@/lib/data";

import {
  createContact,
  createGroup,
  createUser,
  formData,
  signInAs,
} from "../../test/helpers";

// The actions as the browser calls them, for two people. Each action takes
// the user from the session: the user's id is not in the form, so a request
// with the id of someone else's contact can only be refused

// What an action throws instead of returning: a redirect or "not found"
async function thrownBy(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return String((error as { digest?: string }).digest ?? error);
  }
  throw new Error("Expected the action to redirect or say not found");
}

const NEW_CONTACT = formData({ name: "Подмена" });

describe("У контакта и группы есть владелец", () => {
  it("Добавил контакт", async () => {
    const a = await signInAs("a@example.com");

    const result = await thrownBy(() =>
      createContactAction({}, formData({ name: "Фёдор" })),
    );

    expect(result).toContain("NEXT_REDIRECT");
    const mine = await listContacts(a, "");
    expect(mine.map((contact) => contact.name)).toEqual(["Фёдор"]);
  });

  it("Создал группу", async () => {
    const a = await signInAs("a@example.com");
    const contact = await createContact(a, "Анна");

    const result = await createGroupForContactAction(
      contact,
      {},
      formData({ name: "Дача" }),
    );

    expect(result).toEqual({ saved: true });
    expect((await listGroups(a)).map((group) => group.name)).toEqual(["Дача"]);
    const [row] = await db.select().from(groups);
    expect(row.userId).toBe(a);
  });
});

describe("Чужой контакт не меняется прямым запросом", () => {
  async function contactOfA() {
    const a = await createUser("a@example.com");
    const id = await createContact(a, "Фёдор");
    await db.insert(notes).values({ contactId: id, body: "Заметка A" });
    await signInAs("b@example.com");
    return { a, id };
  }

  it("Заметка к чужому контакту", async () => {
    const { id } = await contactOfA();

    const result = await addNoteAction(
      id,
      {},
      formData({ body: "Подброшенная" }),
    );

    expect(result).toMatchObject({ error: "Контакт не найден" });
    const rows = await db.select().from(notes);
    expect(rows.map((note) => note.body)).toEqual(["Заметка A"]);
  });

  it("Изменение чужого контакта", async () => {
    const { id } = await contactOfA();

    const result = await thrownBy(() =>
      updateContactAction(id, {}, NEW_CONTACT),
    );

    expect(result).toContain("404");
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row.name).toBe("Фёдор");
  });

  it("Удаление чужого контакта", async () => {
    const { id } = await contactOfA();

    await thrownBy(() => deleteContactAction(id));

    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row.name).toBe("Фёдор");
    expect(await db.select().from(notes)).toHaveLength(1);
  });

  it("Частота чужого контакта", async () => {
    const { id } = await contactOfA();

    const result = await setTouchIntervalAction(
      id,
      {},
      formData({ touchInterval: "week" }),
    );

    expect(result).toEqual({ error: "Контакт не найден" });
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row.touchInterval).toBeNull();
  });

  it("Группа у чужого контакта", async () => {
    const { a, id } = await contactOfA();
    const b = await signInAs("b@example.com");
    const groupOfB = await createGroup(b, "Дача");

    const added = await setContactGroupAction(
      id,
      {},
      formData({ groupId: String(groupOfB), member: "true" }),
    );
    const created = await createGroupForContactAction(
      id,
      {},
      formData({ name: "Новая" }),
    );

    expect(added).toEqual({ error: "Контакт не найден" });
    expect(created).toMatchObject({ error: "Контакт не найден" });
    expect(await db.select().from(contactGroups)).toEqual([]);
    expect((await listGroups(a)).length).toBe(0);
    expect((await db.select().from(groups)).map((g) => g.name)).toEqual([
      "Дача",
    ]);
  });
});

describe("Без входа сервер не отдаёт и не меняет данные", () => {
  it("Изменение без входа", async () => {
    const a = await createUser("a@example.com");
    const id = await createContact(a, "Фёдор");

    const result = await thrownBy(() =>
      addNoteAction(id, {}, formData({ body: "Подброшенная" })),
    );

    expect(result).toContain("NEXT_REDIRECT");
    expect(result).toContain("/login");
    expect(await db.select().from(notes)).toEqual([]);
  });

  it("Новый контакт без входа не создаётся", async () => {
    const result = await thrownBy(() => createContactAction({}, NEW_CONTACT));

    expect(result).toContain("/login");
    expect(await db.select().from(contacts)).toEqual([]);
  });
});
