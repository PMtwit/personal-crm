import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import {
  countContacts,
  createGroupForContact,
  deleteContact,
  deleteGroup,
  getContact,
  getTouchStatus,
  insertContact,
  insertNote,
  listContactGroupIds,
  listContacts,
  listDueContacts,
  listGroups,
  listNotes,
  renameGroup,
  setContactGroup,
  updateContact,
  updateTouchInterval,
} from "@/lib/data";
import { resolveSelectedGroup } from "@/lib/groups";

import {
  addToGroup,
  createContact,
  createContactWithInterval,
  createGroup,
  createUser,
} from "../../test/helpers";

// Two people use the app: A and B. Each sees and changes only their own data.
// The data layer is called as the pages and actions call it: always with
// the id of the user who is logged in

let a: string;
let b: string;

beforeEach(async () => {
  a = await createUser("a@example.com");
  b = await createUser("b@example.com");
});

const NEW_VALUES = {
  name: "Подмена",
  about: null,
  howWeMet: null,
  phone: null,
  email: null,
};

describe("У контакта и группы есть владелец", () => {
  it("Добавил контакт", async () => {
    const id = await insertContact(a, { ...NEW_VALUES, name: "Фёдор" });

    expect((await listContacts(a, "")).map((c) => c.name)).toEqual(["Фёдор"]);
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(row.userId).toBe(a);
  });

  it("Создал группу", async () => {
    const contact = await createContact(a, "Анна");

    const groupId = await createGroupForContact(a, contact, "Дача");

    expect((await listGroups(a)).map((g) => g.name)).toEqual(["Дача"]);
    const [row] = await db.select().from(groups).where(eq(groups.id, groupId!));
    expect(row.userId).toBe(a);
  });
});

describe("Список и поиск - только свои контакты", () => {
  it("Контакт A не виден B", async () => {
    await createContact(a, "Фёдор Проверкин");
    await createContact(b, "Борис");

    expect((await listContacts(b, "")).map((c) => c.name)).toEqual(["Борис"]);
    expect(await listContacts(b, "Проверкин")).toEqual([]);
  });

  it("Число контактов", async () => {
    for (const name of ["Анна", "Вера", "Глеб"]) {
      await createContact(a, name);
    }
    for (const name of ["Борис", "Дмитрий", "Егор", "Жанна", "Зоя"]) {
      await createContact(b, name);
    }

    expect(await countContacts(b)).toBe(5);
    expect(await countContacts(a)).toBe(3);
  });
});

describe("Чужой контакт по прямой ссылке не найден", () => {
  it("Чужая карточка и заметки", async () => {
    const id = await createContact(a, "Фёдор");
    await db.insert(notes).values({ contactId: id, body: "Секрет A" });

    expect(await getContact(b, id)).toBeNull();
    expect(await listNotes(b, id)).toEqual([]);
    expect(await getTouchStatus(b, id)).toEqual({
      touchInterval: null,
      dueAt: null,
      overdueDays: 0,
    });
    expect(await listContactGroupIds(b, id)).toEqual([]);
    // The owner still sees all of it
    expect((await getContact(a, id))?.name).toBe("Фёдор");
    expect((await listNotes(a, id)).map((n) => n.body)).toEqual(["Секрет A"]);
  });
});

describe("Чужой контакт не меняется прямым запросом", () => {
  it("Заметка к чужому контакту", async () => {
    const id = await createContact(a, "Фёдор");

    expect(await insertNote(b, id, "Подброшенная заметка")).toBe(false);

    expect(await db.select().from(notes)).toEqual([]);
  });

  it("Изменение чужого контакта", async () => {
    const id = await createContact(a, "Фёдор");
    const before = await getContact(a, id);

    expect(await updateContact(b, id, NEW_VALUES)).toBe(false);

    expect(await getContact(a, id)).toEqual(before);
  });

  it("Удаление чужого контакта", async () => {
    const id = await createContact(a, "Фёдор");
    await db.insert(notes).values({ contactId: id, body: "Заметка" });

    expect(await deleteContact(b, id)).toBeNull();

    expect((await getContact(a, id))?.name).toBe("Фёдор");
    expect(await listNotes(a, id)).toHaveLength(1);
  });

  it("Частота чужого контакта", async () => {
    const id = await createContact(a, "Фёдор");

    expect(await updateTouchInterval(b, id, "week")).toBe(false);

    expect((await getContact(a, id))?.touchInterval).toBeNull();
    expect((await getContact(a, id))?.touchIntervalSetAt).toBeNull();
  });

  it("Группа у чужого контакта", async () => {
    const id = await createContact(a, "Фёдор");
    const groupOfA = await createGroup(a, "Семья");
    const groupOfB = await createGroup(b, "Дача");

    expect(await setContactGroup(b, id, groupOfB, true)).toBe(
      "contact-not-found",
    );
    expect(await setContactGroup(b, id, groupOfA, true)).toBe(
      "contact-not-found",
    );
    expect(await createGroupForContact(b, id, "Новая")).toBeNull();

    expect(await db.select().from(contactGroups)).toEqual([]);
    expect((await listGroups(b)).map((g) => g.name)).toEqual(["Дача"]);
    expect((await listGroups(a)).map((g) => g.name)).toEqual(["Семья"]);
  });
});

describe("У каждого свои группы", () => {
  it("Группы B не видны A", async () => {
    const own = await createContact(b, "Борис");
    const dacha = await createGroup(b, "Дача");
    await addToGroup(own, dacha);
    // A has a contact in a group of the same id range, so a missing filter would show
    await createContact(a, "Анна");

    expect(await listGroups(a)).toEqual([]);
    expect(await listGroups(b)).toEqual([
      { id: dacha, name: "Дача", contactCount: 1 },
    ]);
  });

  it("Чужая группа в адресе", async () => {
    await createContact(a, "Анна");
    await createContact(a, "Вера");
    const groupOfB = await createGroup(b, "Дача");

    // The home page looks for the group of the address among the user's own
    const selected = resolveSelectedGroup(
      String(groupOfB),
      await listGroups(a),
    );

    expect(selected).toBeNull();
    // "All" is chosen: all the contacts of A, as for a group that does not exist
    expect((await listContacts(a, "", selected?.id ?? null)).length).toBe(2);
    expect(await countContacts(a, selected?.id ?? null)).toBe(2);
  });

  it("Свой контакт в чужую группу", async () => {
    const mine = await createContact(a, "Анна");
    const groupOfB = await createGroup(b, "Дача");

    expect(await setContactGroup(a, mine, groupOfB, true)).toBe(
      "group-not-found",
    );

    expect(await db.select().from(contactGroups)).toEqual([]);
    expect(await listGroups(b)).toEqual([
      { id: groupOfB, name: "Дача", contactCount: 0 },
    ]);
  });

  it("Переименование и удаление чужой группы", async () => {
    const groupOfB = await createGroup(b, "Дача");

    expect(await renameGroup(a, groupOfB, "Огород")).toBe("not-found");
    expect(await deleteGroup(a, groupOfB)).toBe(false);

    const rows = await db.select().from(groups);
    expect(rows.map((g) => g.name)).toEqual(["Дача"]);
  });
});

describe("«Пора связаться» - только свои", () => {
  it("Срок у контакта A", async () => {
    await createContactWithInterval(a, "Анна", {
      interval: "week",
      setDaysAgo: 30,
    });
    await createContact(b, "Борис");

    expect(await listDueContacts(b)).toEqual([]);
    expect((await listDueContacts(a)).map((c) => c.name)).toEqual(["Анна"]);
  });
});
