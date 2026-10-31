import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

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
  setContactGroup,
} from "@/lib/data";
import {
  addToGroup,
  createContact,
  createContactWithInterval,
  createGroup,
} from "../../test/helpers";

async function groupNames() {
  return (await listGroups()).map((group) => group.name);
}

describe("Раздел «Группы» в карточке", () => {
  it("Новый контакт ни в одной группе", async () => {
    await createGroup("Дача");
    await createGroup("Семья");

    const id = await insertContact({
      name: "Анна",
      about: null,
      howWeMet: null,
      phone: null,
      email: null,
    });

    expect(await groupNames()).toEqual(["Дача", "Семья"]);
    expect(await listContactGroupIds(id)).toEqual([]);
  });

  it("Группы по алфавиту", async () => {
    await createGroup("Семья");
    await createGroup("Аналитики");
    await createGroup("Дача");

    expect(await groupNames()).toEqual(["Аналитики", "Дача", "Семья"]);
  });
});

describe("Отметка группы одним нажатием", () => {
  it("Добавил в группу", async () => {
    const anna = await createContact("Анна");
    const family = await createGroup("Семья");

    expect(await setContactGroup(anna, family, true)).toBe("ok");

    // Read again from the database: this is what a reloaded page shows
    expect(await listContactGroupIds(anna)).toEqual([family]);
  });

  it("Нажатие на ту же таблетку дважды ничего не ломает", async () => {
    const anna = await createContact("Анна");
    const family = await createGroup("Семья");

    expect(await setContactGroup(anna, family, true)).toBe("ok");
    expect(await setContactGroup(anna, family, true)).toBe("ok");

    expect(await listContactGroupIds(anna)).toEqual([family]);
  });

  it("Несколько групп сразу", async () => {
    const anna = await createContact("Анна");
    const friends = await createGroup("Друзья");
    const dacha = await createGroup("Дача");

    await setContactGroup(anna, friends, true);
    await setContactGroup(anna, dacha, true);

    expect((await listContactGroupIds(anna)).sort()).toEqual(
      [friends, dacha].sort(),
    );
  });

  it("Убрал из группы", async () => {
    const anna = await createContact("Анна");
    const family = await createGroup("Семья");
    await addToGroup(anna, family);

    expect(await setContactGroup(anna, family, false)).toBe("ok");

    expect(await listContactGroupIds(anna)).toEqual([]);
    expect((await listGroups())[0].contactCount).toBe(0);
  });

  it("Отметка группы у одного контакта не трогает остальных", async () => {
    const anna = await createContact("Анна");
    const boris = await createContact("Борис");
    const family = await createGroup("Семья");
    await addToGroup(boris, family);

    await setContactGroup(anna, family, true);
    await setContactGroup(anna, family, false);

    expect(await listContactGroupIds(boris)).toEqual([family]);
  });

  it("Тот же выбор в другом браузере", async () => {
    const anna = await createContact("Анна");
    const friends = await createGroup("Друзья");

    await setContactGroup(anna, friends, true);

    // Another browser has nothing but the database: it reads the card from scratch
    expect(await listContactGroupIds(anna)).toEqual([friends]);
    expect(await listGroups()).toEqual([
      { id: friends, name: "Друзья", contactCount: 1 },
    ]);
  });

  it("Контакт удалили в другой вкладке", async () => {
    const family = await createGroup("Семья");

    expect(await setContactGroup(987654, family, true)).toBe(
      "contact-not-found",
    );

    expect(await db.select().from(contactGroups)).toEqual([]);
  });

  it("Группу удалили в другой вкладке", async () => {
    const anna = await createContact("Анна");
    const dacha = await createGroup("Дача");
    await db.delete(groups).where(eq(groups.id, dacha));

    expect(await setContactGroup(anna, dacha, true)).toBe("group-not-found");

    expect(await listContactGroupIds(anna)).toEqual([]);
    // The pill is gone from the card: the group is not in the list
    expect(await groupNames()).toEqual([]);
  });
});

describe("Новая группа из карточки", () => {
  it("Создал группу", async () => {
    const anna = await createContact("Анна");
    const boris = await createContact("Борис");

    const groupId = await createGroupForContact(anna, "Дача");

    expect(groupId).not.toBeNull();
    expect(await listContactGroupIds(anna)).toEqual([groupId]);
    expect(await listContactGroupIds(boris)).toEqual([]);
    expect(await listGroups()).toEqual([
      { id: groupId, name: "Дача", contactCount: 1 },
    ]);
  });

  it("Двойное нажатие «Создать»", async () => {
    const anna = await createContact("Анна");

    // Two requests at the same moment, as two quick presses
    const [first, second] = await Promise.all([
      createGroupForContact(anna, "Дача"),
      createGroupForContact(anna, "Дача"),
    ]);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(await db.select().from(groups)).toHaveLength(1);
    expect(await db.select().from(contactGroups)).toHaveLength(1);
  });

  it("Контакт удалили в другой вкладке", async () => {
    expect(await createGroupForContact(987654, "Дача")).toBeNull();

    expect(await groupNames()).toEqual([]);
  });
});

describe("Название группы не повторяется", () => {
  it("Создал группу с уже занятым названием", async () => {
    const family = await createGroup("Семья");
    const boris = await createContact("Борис");

    const groupId = await createGroupForContact(boris, "семья");

    expect(groupId).toBe(family);
    expect(await groupNames()).toEqual(["Семья"]);
    expect(await listContactGroupIds(boris)).toEqual([family]);
  });

  it("База не даёт завести две группы с одним названием в разном регистре", async () => {
    await createGroup("Семья");

    await expect(createGroup("СЕМЬЯ")).rejects.toThrow();
  });
});

async function contactNames(query: string, groupId: number | null) {
  return (await listContacts(query, groupId)).map((contact) => contact.name);
}

describe("Фильтр по группе на главной", () => {
  it("Выбрал группу", async () => {
    const anna = await createContact("Анна");
    const boris = await createContact("Борис");
    await createContact("Вера");
    const family = await createGroup("Семья");
    await addToGroup(anna, family);
    await addToGroup(boris, family);

    expect(await contactNames("", family)).toEqual(["Анна", "Борис"]);
    expect(await countContacts(family)).toBe(2);
  });

  it("Контакт в двух группах", async () => {
    const anna = await createContact("Анна");
    await createContact("Борис");
    const family = await createGroup("Семья");
    const dacha = await createGroup("Дача");
    await addToGroup(anna, family);
    await addToGroup(anna, dacha);

    expect(await contactNames("", family)).toEqual(["Анна"]);
    expect(await contactNames("", dacha)).toEqual(["Анна"]);
    // Counted once in each group, and the list has her once, not twice
    expect(await countContacts(family)).toBe(1);
    expect(await countContacts(dacha)).toBe(1);
  });

  it("Вернулся ко всем", async () => {
    const anna = await createContact("Анна");
    await createContact("Борис");
    const family = await createGroup("Семья");
    await addToGroup(anna, family);

    expect(await contactNames("", null)).toEqual(["Анна", "Борис"]);
    expect(await countContacts(null)).toBe(2);
    expect(await countContacts()).toBe(2);
  });

  it("Пустая группа", async () => {
    await createContact("Анна");
    const dacha = await createGroup("Дача");

    expect(await contactNames("", dacha)).toEqual([]);
    expect(await countContacts(dacha)).toBe(0);
  });

  it("Поиск внутри группы", async () => {
    const family = await createGroup("Семья");
    const dacha = await createGroup("Дача");
    for (const name of ["Анна", "Борис", "Вера", "Галина", "Дмитрий"]) {
      await addToGroup(await createContact(name), family);
    }
    // Matches the query too, but is not in the family
    await addToGroup(await createContact("Анатолий"), dacha);

    expect(await contactNames("Ан", family)).toEqual(["Анна"]);
    // "из N" counts the family only, not the whole list
    expect(await countContacts(family)).toBe(5);
    expect(await contactNames("Ан", null)).toEqual(["Анатолий", "Анна"]);
  });
});

async function dueNames(groupId: number | null) {
  return (await listDueContacts(groupId)).map((contact) => contact.name);
}

// A contact whose due date came: "once a week", chosen that many days ago
function overdue(name: string, setDaysAgo = 30) {
  return createContactWithInterval(name, { interval: "week", setDaysAgo });
}

describe("Блок «Пора связаться» учитывает выбранную группу", () => {
  it("Только выбранная группа", async () => {
    const anna = await overdue("Анна", 30);
    const vera = await overdue("Вера", 20);
    const boris = await overdue("Борис", 40);
    const family = await createGroup("Семья");
    const dacha = await createGroup("Дача");
    await addToGroup(anna, family);
    await addToGroup(vera, family);
    await addToGroup(boris, dacha);

    // The most overdue first: Anna's date came earlier than Vera's
    expect(await dueNames(family)).toEqual(["Анна", "Вера"]);
    expect(await dueNames(dacha)).toEqual(["Борис"]);
  });

  it("В группе никому не пора", async () => {
    const dacha = await createGroup("Дача");
    const family = await createGroup("Семья");
    // The dacha's contact has just chosen "once a year": the due date is far away
    const boris = await createContactWithInterval("Борис", {
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
    const family = await createGroup("Семья");
    await addToGroup(anna, family);

    expect(await dueNames(family)).toEqual(["Анна"]);
    // Without a group: everyone whose time has come, in a group or not
    expect(await dueNames(null)).toEqual(["Анна", "Вера"]);
    expect((await listDueContacts()).map((contact) => contact.name)).toEqual([
      "Анна",
      "Вера",
    ]);
  });

  it("Больше пяти в группе", async () => {
    const family = await createGroup("Семья");
    // 12 are due, 7 of them in the family; the later the name, the less overdue
    for (let index = 0; index < 12; index += 1) {
      const id = await overdue(`Контакт ${String(index + 1).padStart(2, "0")}`, 60 - index);
      if (index < 7) {
        await addToGroup(id, family);
      }
    }

    const inFamily = await listDueContacts(family);
    expect(inFamily).toHaveLength(7);
    expect(inFamily.map((contact) => contact.name)).toEqual(
      Array.from({ length: 7 }, (_, index) => `Контакт ${String(index + 1).padStart(2, "0")}`),
    );
    expect(await listDueContacts(null)).toHaveLength(12);
  });

  it("Контакт в двух группах попадает в блок один раз", async () => {
    const anna = await overdue("Анна");
    const family = await createGroup("Семья");
    const dacha = await createGroup("Дача");
    await addToGroup(anna, family);
    await addToGroup(anna, dacha);

    expect(await dueNames(family)).toEqual(["Анна"]);
    expect(await dueNames(null)).toEqual(["Анна"]);
  });
});

describe("Страница «Группы»", () => {
  it("Список групп", async () => {
    const dacha = await createGroup("Дача");
    const family = await createGroup("Семья");
    for (const name of ["Анна", "Борис", "Вера"]) {
      await addToGroup(await createContact(name), dacha);
    }
    for (const name of ["Галина", "Дмитрий", "Елена", "Жанна", "Зоя"]) {
      await addToGroup(await createContact(name), family);
    }

    expect(await listGroups()).toEqual([
      { id: dacha, name: "Дача", contactCount: 3 },
      { id: family, name: "Семья", contactCount: 5 },
    ]);
  });

  it("Группа без контактов в списке с нулём", async () => {
    const dacha = await createGroup("Дача");

    expect(await listGroups()).toEqual([
      { id: dacha, name: "Дача", contactCount: 0 },
    ]);
  });

  it("Удалили контакт из группы", async () => {
    const family = await createGroup("Семья");
    const ids: number[] = [];
    for (const name of ["Анна", "Борис", "Вера", "Галина", "Дмитрий"]) {
      const id = await createContact(name);
      await addToGroup(id, family);
      ids.push(id);
    }

    expect(await deleteContact(ids[0])).toBe("Анна");

    expect((await listGroups())[0].contactCount).toBe(4);
    expect(await contactNames("", family)).not.toContain("Анна");
    expect(await countContacts(family)).toBe(4);
  });
});
