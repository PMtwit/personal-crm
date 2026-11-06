import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, groups } from "@/db/schema";
import {
  countContacts,
  createGroupForContact,
  deleteContact,
  insertContact,
  listContactGroupIds,
  listContacts,
  listDueContacts,
  listGroups,
  renameGroup,
  setContactGroup,
} from "@/lib/data";
import {
  addToGroup,
  createContact,
  createContactWithInterval,
  createGroup,
  createOwner,
  createUser,
} from "../../test/helpers";

let owner: string;

beforeEach(async () => {
  owner = await createOwner();
});

async function groupNames() {
  return (await listGroups(owner)).map((group) => group.name);
}

describe("Раздел «Группы» в карточке", () => {
  it("Новый контакт ни в одной группе", async () => {
    await createGroup(owner, "Дача");
    await createGroup(owner, "Семья");

    const id = await insertContact(owner, {
      name: "Анна",
      about: null,
      howWeMet: null,
      phone: null,
      email: null,
    });

    expect(await groupNames()).toEqual(["Дача", "Семья"]);
    expect(await listContactGroupIds(owner, id)).toEqual([]);
  });

  it("Группы по алфавиту", async () => {
    await createGroup(owner, "Семья");
    await createGroup(owner, "Аналитики");
    await createGroup(owner, "Дача");

    expect(await groupNames()).toEqual(["Аналитики", "Дача", "Семья"]);
  });
});

describe("Отметка группы одним нажатием", () => {
  it("Добавил в группу", async () => {
    const anna = await createContact(owner, "Анна");
    const family = await createGroup(owner, "Семья");

    expect(await setContactGroup(owner, anna, family, true)).toBe("ok");

    // Read again from the database: this is what a reloaded page shows
    expect(await listContactGroupIds(owner, anna)).toEqual([family]);
  });

  it("Нажатие на ту же таблетку дважды ничего не ломает", async () => {
    const anna = await createContact(owner, "Анна");
    const family = await createGroup(owner, "Семья");

    expect(await setContactGroup(owner, anna, family, true)).toBe("ok");
    expect(await setContactGroup(owner, anna, family, true)).toBe("ok");

    expect(await listContactGroupIds(owner, anna)).toEqual([family]);
  });

  it("Несколько групп сразу", async () => {
    const anna = await createContact(owner, "Анна");
    const friends = await createGroup(owner, "Друзья");
    const dacha = await createGroup(owner, "Дача");

    await setContactGroup(owner, anna, friends, true);
    await setContactGroup(owner, anna, dacha, true);

    expect((await listContactGroupIds(owner, anna)).sort()).toEqual(
      [friends, dacha].sort(),
    );
  });

  it("Убрал из группы", async () => {
    const anna = await createContact(owner, "Анна");
    const family = await createGroup(owner, "Семья");
    await addToGroup(anna, family);

    expect(await setContactGroup(owner, anna, family, false)).toBe("ok");

    expect(await listContactGroupIds(owner, anna)).toEqual([]);
    expect((await listGroups(owner))[0].contactCount).toBe(0);
  });

  it("Отметка группы у одного контакта не трогает остальных", async () => {
    const anna = await createContact(owner, "Анна");
    const boris = await createContact(owner, "Борис");
    const family = await createGroup(owner, "Семья");
    await addToGroup(boris, family);

    await setContactGroup(owner, anna, family, true);
    await setContactGroup(owner, anna, family, false);

    expect(await listContactGroupIds(owner, boris)).toEqual([family]);
  });

  it("Тот же выбор в другом браузере", async () => {
    const anna = await createContact(owner, "Анна");
    const friends = await createGroup(owner, "Друзья");

    await setContactGroup(owner, anna, friends, true);

    // Another browser has nothing but the database: it reads the card from scratch
    expect(await listContactGroupIds(owner, anna)).toEqual([friends]);
    expect(await listGroups(owner)).toEqual([
      { id: friends, name: "Друзья", contactCount: 1 },
    ]);
  });

  it("Контакт удалили в другой вкладке", async () => {
    const family = await createGroup(owner, "Семья");

    expect(await setContactGroup(owner, 987654, family, true)).toBe(
      "contact-not-found",
    );

    expect(await db.select().from(contactGroups)).toEqual([]);
  });

  it("Группу удалили в другой вкладке", async () => {
    const anna = await createContact(owner, "Анна");
    const dacha = await createGroup(owner, "Дача");
    await db.delete(groups).where(eq(groups.id, dacha));

    expect(await setContactGroup(owner, anna, dacha, true)).toBe(
      "group-not-found",
    );

    expect(await listContactGroupIds(owner, anna)).toEqual([]);
    // The pill is gone from the card: the group is not in the list
    expect(await groupNames()).toEqual([]);
  });
});

describe("Новая группа из карточки", () => {
  it("Создал группу", async () => {
    const anna = await createContact(owner, "Анна");
    const boris = await createContact(owner, "Борис");

    const groupId = await createGroupForContact(owner, anna, "Дача");

    expect(groupId).not.toBeNull();
    expect(await listContactGroupIds(owner, anna)).toEqual([groupId]);
    expect(await listContactGroupIds(owner, boris)).toEqual([]);
    expect(await listGroups(owner)).toEqual([
      { id: groupId, name: "Дача", contactCount: 1 },
    ]);
  });

  it("Двойное нажатие «Создать»", async () => {
    const anna = await createContact(owner, "Анна");

    // Two requests at the same moment, as two quick presses
    const [first, second] = await Promise.all([
      createGroupForContact(owner, anna, "Дача"),
      createGroupForContact(owner, anna, "Дача"),
    ]);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(await db.select().from(groups)).toHaveLength(1);
    expect(await db.select().from(contactGroups)).toHaveLength(1);
  });

  it("Контакт удалили в другой вкладке", async () => {
    expect(await createGroupForContact(owner, 987654, "Дача")).toBeNull();

    expect(await groupNames()).toEqual([]);
  });
});

describe("Название группы не повторяется", () => {
  it("Создал группу с уже занятым названием", async () => {
    const family = await createGroup(owner, "Семья");
    const boris = await createContact(owner, "Борис");

    const groupId = await createGroupForContact(owner, boris, "семья");

    expect(groupId).toBe(family);
    expect(await groupNames()).toEqual(["Семья"]);
    expect(await listContactGroupIds(owner, boris)).toEqual([family]);
  });

  it("У A и B по группе «Друзья»", async () => {
    const a = await createUser("a@example.com");
    const b = await createUser("b@example.com");
    const contactOfA = await createContact(a, "Анна");
    const contactOfB = await createContact(b, "Борис");
    const friendsOfA = await createGroupForContact(a, contactOfA, "Друзья");

    const friendsOfB = await createGroupForContact(b, contactOfB, "Друзья");

    expect(friendsOfB).not.toBeNull();
    expect(friendsOfB).not.toBe(friendsOfA);
    expect(await listContactGroupIds(b, contactOfB)).toEqual([friendsOfB]);
    // The group of A is as it was: one contact, Boris did not get in
    expect(await listGroups(a)).toEqual([
      { id: friendsOfA, name: "Друзья", contactCount: 1 },
    ]);
    expect(await listContactGroupIds(a, contactOfA)).toEqual([friendsOfA]);
  });

  it("Переименование в название чужой группы", async () => {
    const a = await createUser("a@example.com");
    const b = await createUser("b@example.com");
    await createGroup(a, "Друзья");
    const acquaintances = await createGroup(b, "Приятели");

    expect(await renameGroup(b, acquaintances, "Друзья")).toBe("ok");

    expect((await listGroups(b)).map((group) => group.name)).toEqual([
      "Друзья",
    ]);
  });

  it("База не даёт завести две группы с одним названием в разном регистре", async () => {
    await createGroup(owner, "Семья");

    await expect(createGroup(owner, "СЕМЬЯ")).rejects.toThrow();
  });
});

async function contactNames(query: string, groupId: number | null) {
  return (await listContacts(owner, query, groupId)).map(
    (contact) => contact.name,
  );
}

describe("Фильтр по группе на главной", () => {
  it("Выбрал группу", async () => {
    const anna = await createContact(owner, "Анна");
    const boris = await createContact(owner, "Борис");
    await createContact(owner, "Вера");
    const family = await createGroup(owner, "Семья");
    await addToGroup(anna, family);
    await addToGroup(boris, family);

    expect(await contactNames("", family)).toEqual(["Анна", "Борис"]);
    expect(await countContacts(owner, family)).toBe(2);
  });

  it("Контакт в двух группах", async () => {
    const anna = await createContact(owner, "Анна");
    await createContact(owner, "Борис");
    const family = await createGroup(owner, "Семья");
    const dacha = await createGroup(owner, "Дача");
    await addToGroup(anna, family);
    await addToGroup(anna, dacha);

    expect(await contactNames("", family)).toEqual(["Анна"]);
    expect(await contactNames("", dacha)).toEqual(["Анна"]);
    // Counted once in each group, and the list has her once, not twice
    expect(await countContacts(owner, family)).toBe(1);
    expect(await countContacts(owner, dacha)).toBe(1);
  });

  it("Вернулся ко всем", async () => {
    const anna = await createContact(owner, "Анна");
    await createContact(owner, "Борис");
    const family = await createGroup(owner, "Семья");
    await addToGroup(anna, family);

    expect(await contactNames("", null)).toEqual(["Анна", "Борис"]);
    expect(await countContacts(owner, null)).toBe(2);
    expect(await countContacts(owner)).toBe(2);
  });

  it("Пустая группа", async () => {
    await createContact(owner, "Анна");
    const dacha = await createGroup(owner, "Дача");

    expect(await contactNames("", dacha)).toEqual([]);
    expect(await countContacts(owner, dacha)).toBe(0);
  });

  it("Поиск внутри группы", async () => {
    const family = await createGroup(owner, "Семья");
    const dacha = await createGroup(owner, "Дача");
    for (const name of ["Анна", "Борис", "Вера", "Галина", "Дмитрий"]) {
      await addToGroup(await createContact(owner, name), family);
    }
    // Matches the query too, but is not in the family
    await addToGroup(await createContact(owner, "Анатолий"), dacha);

    expect(await contactNames("Ан", family)).toEqual(["Анна"]);
    // "из N" counts the family only, not the whole list
    expect(await countContacts(owner, family)).toBe(5);
    expect(await contactNames("Ан", null)).toEqual(["Анатолий", "Анна"]);
  });
});

async function dueNames(groupId: number | null) {
  return (await listDueContacts(owner, groupId)).map((contact) => contact.name);
}

// A contact whose due date came: "once a week", chosen that many days ago
function overdue(name: string, setDaysAgo = 30) {
  return createContactWithInterval(owner, name, {
    interval: "week",
    setDaysAgo,
  });
}

describe("Блок «Пора связаться» учитывает выбранную группу", () => {
  it("Только выбранная группа", async () => {
    const anna = await overdue("Анна", 30);
    const vera = await overdue("Вера", 20);
    const boris = await overdue("Борис", 40);
    const family = await createGroup(owner, "Семья");
    const dacha = await createGroup(owner, "Дача");
    await addToGroup(anna, family);
    await addToGroup(vera, family);
    await addToGroup(boris, dacha);

    // The most overdue first: Anna's date came earlier than Vera's
    expect(await dueNames(family)).toEqual(["Анна", "Вера"]);
    expect(await dueNames(dacha)).toEqual(["Борис"]);
  });

  it("В группе никому не пора", async () => {
    const dacha = await createGroup(owner, "Дача");
    const family = await createGroup(owner, "Семья");
    // The dacha's contact has just chosen "once a year": the due date is far away
    const boris = await createContactWithInterval(owner, "Борис", {
      interval: "year",
      setDaysAgo: 1,
    });
    await addToGroup(boris, dacha);
    await addToGroup(await overdue("Анна"), family);

    expect(await dueNames(dacha)).toEqual([]);
    expect(await dueNames(null)).toEqual(["Анна"]);
  });

  it("Вернулся ко всем", async () => {
    const anna = await overdue("Анна", 30);
    await overdue("Вера", 20); // in no group
    const family = await createGroup(owner, "Семья");
    await addToGroup(anna, family);

    expect(await dueNames(family)).toEqual(["Анна"]);
    // Without a group: everyone whose time has come, in a group or not
    expect(await dueNames(null)).toEqual(["Анна", "Вера"]);
    expect(
      (await listDueContacts(owner)).map((contact) => contact.name),
    ).toEqual(["Анна", "Вера"]);
  });

  it("Больше пяти в группе", async () => {
    const family = await createGroup(owner, "Семья");
    // 12 are due, 7 of them in the family; the later the name, the less overdue
    for (let index = 0; index < 12; index += 1) {
      const id = await overdue(
        `Контакт ${String(index + 1).padStart(2, "0")}`,
        60 - index,
      );
      if (index < 7) {
        await addToGroup(id, family);
      }
    }

    const inFamily = await listDueContacts(owner, family);
    expect(inFamily).toHaveLength(7);
    expect(inFamily.map((contact) => contact.name)).toEqual(
      Array.from(
        { length: 7 },
        (_, index) => `Контакт ${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(await listDueContacts(owner, null)).toHaveLength(12);
  });

  it("Контакт в двух группах попадает в блок один раз", async () => {
    const anna = await overdue("Анна");
    const family = await createGroup(owner, "Семья");
    const dacha = await createGroup(owner, "Дача");
    await addToGroup(anna, family);
    await addToGroup(anna, dacha);

    expect(await dueNames(family)).toEqual(["Анна"]);
    expect(await dueNames(null)).toEqual(["Анна"]);
  });
});

describe("Страница «Группы»", () => {
  it("Список групп", async () => {
    const dacha = await createGroup(owner, "Дача");
    const family = await createGroup(owner, "Семья");
    for (const name of ["Анна", "Борис", "Вера"]) {
      await addToGroup(await createContact(owner, name), dacha);
    }
    for (const name of ["Галина", "Дмитрий", "Елена", "Жанна", "Зоя"]) {
      await addToGroup(await createContact(owner, name), family);
    }

    expect(await listGroups(owner)).toEqual([
      { id: dacha, name: "Дача", contactCount: 3 },
      { id: family, name: "Семья", contactCount: 5 },
    ]);
  });

  it("Группа без контактов в списке с нулём", async () => {
    const dacha = await createGroup(owner, "Дача");

    expect(await listGroups(owner)).toEqual([
      { id: dacha, name: "Дача", contactCount: 0 },
    ]);
  });

  it("Удалили контакт из группы", async () => {
    const family = await createGroup(owner, "Семья");
    const ids: number[] = [];
    for (const name of ["Анна", "Борис", "Вера", "Галина", "Дмитрий"]) {
      const id = await createContact(owner, name);
      await addToGroup(id, family);
      ids.push(id);
    }

    expect(await deleteContact(owner, ids[0])).toBe("Анна");

    expect((await listGroups(owner))[0].contactCount).toBe(4);
    expect(await contactNames("", family)).not.toContain("Анна");
    expect(await countContacts(owner, family)).toBe(4);
  });
});
