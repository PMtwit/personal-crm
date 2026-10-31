import { revalidatePath } from "next/cache";
import { describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import {
  createGroupForContactAction,
  deleteGroupAction,
  renameGroupAction,
  setContactGroupAction,
} from "@/app/actions";
import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { listContactGroupIds, listGroups } from "@/lib/data";
import {
  addToGroup,
  createContact,
  createContactWithInterval,
  createGroup,
  formData,
} from "../../test/helpers";

function setGroup(contactId: number, groupId: number, member: boolean) {
  return setContactGroupAction(
    contactId,
    {},
    formData({ groupId: String(groupId), member: String(member) }),
  );
}

function createGroupFor(contactId: number, name: string) {
  return createGroupForContactAction(contactId, {}, formData({ name }));
}

function rename(groupId: number, name: string) {
  return renameGroupAction(groupId, {}, formData({ name }));
}

async function groupNames() {
  return (await listGroups()).map((group) => group.name);
}

describe("Отметка группы одним нажатием", () => {
  it("Добавил в группу", async () => {
    const anna = await createContact("Анна");
    const family = await createGroup("Семья");

    expect(await setGroup(anna, family, true)).toEqual({});

    expect(await listContactGroupIds(anna)).toEqual([family]);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("Убрал из группы", async () => {
    const anna = await createContact("Анна");
    const family = await createGroup("Семья");
    await addToGroup(anna, family);

    expect(await setGroup(anna, family, false)).toEqual({});

    expect(await listContactGroupIds(anna)).toEqual([]);
  });

  it("Контакт удалили в другой вкладке", async () => {
    const family = await createGroup("Семья");

    expect(await setGroup(987654, family, true)).toEqual({
      error: "Контакт не найден",
    });

    expect(await db.select().from(contactGroups)).toEqual([]);
  });

  it("Группу удалили в другой вкладке", async () => {
    const anna = await createContact("Анна");

    // The id of a group that is gone
    expect(await setGroup(anna, 987654, true)).toEqual({
      error: "Группа не найдена",
    });

    expect(await listContactGroupIds(anna)).toEqual([]);
    // The card is refreshed, so the pill of the deleted group disappears
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("Неверная отметка из формы не сохраняется", async () => {
    const anna = await createContact("Анна");
    const family = await createGroup("Семья");

    const result = await setContactGroupAction(
      anna,
      {},
      formData({ groupId: String(family), member: "maybe" }),
    );

    expect(result.error).toBeTruthy();
    expect(await db.select().from(contactGroups)).toEqual([]);
  });
});

describe("Новая группа из карточки", () => {
  it("Создал группу", async () => {
    const anna = await createContact("Анна");
    const boris = await createContact("Борис");

    expect(await createGroupFor(anna, "Дача")).toEqual({ saved: true });

    const [dacha] = await listGroups();
    expect(dacha.name).toBe("Дача");
    expect(await listContactGroupIds(anna)).toEqual([dacha.id]);
    expect(await listContactGroupIds(boris)).toEqual([]);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("Двойное нажатие «Создать»", async () => {
    const anna = await createContact("Анна");

    const results = await Promise.all([
      createGroupFor(anna, "Дача"),
      createGroupFor(anna, "Дача"),
    ]);

    expect(results).toEqual([{ saved: true }, { saved: true }]);
    expect(await groupNames()).toEqual(["Дача"]);
    expect(await db.select().from(contactGroups)).toHaveLength(1);
  });

  it("Контакт удалили в другой вкладке", async () => {
    expect(await createGroupFor(987654, "Дача")).toEqual({
      name: "Дача",
      error: "Контакт не найден",
    });

    expect(await db.select().from(groups)).toEqual([]);
  });
});

describe("Правила названия группы", () => {
  it("Пустое название", async () => {
    const anna = await createContact("Анна");

    expect(await createGroupFor(anna, "   ")).toEqual({
      name: "   ",
      error: "Укажите название",
    });

    expect(await db.select().from(groups)).toEqual([]);
  });

  it("Слишком длинное название", async () => {
    const anna = await createContact("Анна");
    const longName = "а".repeat(51);

    expect(await createGroupFor(anna, longName)).toEqual({
      name: longName,
      error: "Слишком длинно: не больше 50 символов",
    });

    expect(await db.select().from(groups)).toEqual([]);
  });

  it("Название из 50 символов подходит", async () => {
    const anna = await createContact("Анна");

    expect(await createGroupFor(anna, "а".repeat(50))).toEqual({ saved: true });
  });

  it("Пробелы по краям", async () => {
    const anna = await createContact("Анна");

    expect(await createGroupFor(anna, "  Дача  ")).toEqual({ saved: true });

    expect(await groupNames()).toEqual(["Дача"]);
  });
});

describe("Название группы не повторяется", () => {
  it("Создал группу с уже занятым названием", async () => {
    const family = await createGroup("Семья");
    const boris = await createContact("Борис");

    expect(await createGroupFor(boris, "семья")).toEqual({ saved: true });

    expect(await groupNames()).toEqual(["Семья"]);
    expect(await listContactGroupIds(boris)).toEqual([family]);
  });
});

describe("Переименование группы", () => {
  it("Переименовал", async () => {
    const anna = await createContact("Анна");
    const boris = await createContact("Борис");
    const dacha = await createGroup("Дача");
    await addToGroup(anna, dacha);
    await addToGroup(boris, dacha);

    expect(await rename(dacha, "Дача в Лесном")).toEqual({ saved: true });

    // The group is the same one: same id, same people
    expect(await listGroups()).toEqual([
      { id: dacha, name: "Дача в Лесном", contactCount: 2 },
    ]);
    expect(await listContactGroupIds(anna)).toEqual([dacha]);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("Пробелы по краям при переименовании", async () => {
    const dacha = await createGroup("Дача");

    expect(await rename(dacha, "  Сад  ")).toEqual({ saved: true });

    expect(await groupNames()).toEqual(["Сад"]);
  });

  it("Название занято другой группой", async () => {
    await createGroup("Семья");
    const friends = await createGroup("Друзья");

    expect(await rename(friends, "семья")).toEqual({
      name: "семья",
      error: "Такая группа уже есть",
    });

    expect(await groupNames()).toEqual(["Друзья", "Семья"]);
  });

  it("Поменял только регистр", async () => {
    const family = await createGroup("семья");

    expect(await rename(family, "Семья")).toEqual({ saved: true });

    expect(await groupNames()).toEqual(["Семья"]);
  });

  it("Оставил то же название", async () => {
    const family = await createGroup("Семья");

    expect(await rename(family, "Семья")).toEqual({ saved: true });

    expect(await groupNames()).toEqual(["Семья"]);
  });

  it("Пустое название при переименовании", async () => {
    const family = await createGroup("Семья");

    expect(await rename(family, "  ")).toEqual({
      name: "  ",
      error: "Укажите название",
    });

    expect(await groupNames()).toEqual(["Семья"]);
  });

  it("Слишком длинное название при переименовании", async () => {
    const family = await createGroup("Семья");

    expect((await rename(family, "а".repeat(51))).error).toBe(
      "Слишком длинно: не больше 50 символов",
    );

    expect(await groupNames()).toEqual(["Семья"]);
  });

  it("Группу удалили в другой вкладке", async () => {
    const dacha = await createGroup("Дача");
    await db.delete(groups).where(eq(groups.id, dacha));

    expect(await rename(dacha, "Сад")).toEqual({
      name: "Сад",
      error: "Группа не найдена",
    });

    expect(await db.select().from(groups)).toEqual([]);
  });
});

describe("Удаление группы", () => {
  it("Удалил группу", async () => {
    const anna = await createContactWithInterval("Анна", {
      interval: "month",
      setDaysAgo: 10,
      noteDaysAgo: [5],
    });
    const boris = await createContact("Борис");
    const dacha = await createGroup("Дача");
    const family = await createGroup("Семья");
    await addToGroup(anna, dacha);
    await addToGroup(boris, dacha);
    await addToGroup(anna, family);

    await deleteGroupAction(dacha);

    expect(await groupNames()).toEqual(["Семья"]);
    // Both people are in place, with their notes, interval and other groups
    expect(await db.select({ name: contacts.name }).from(contacts)).toHaveLength(2);
    expect(await db.select().from(notes)).toHaveLength(1);
    const [annaRow] = await db.select().from(contacts).where(eq(contacts.id, anna));
    expect(annaRow.touchInterval).toBe("month");
    expect(annaRow.touchIntervalSetAt).not.toBeNull();
    expect(await listContactGroupIds(anna)).toEqual([family]);
    expect(await listContactGroupIds(boris)).toEqual([]);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("Группу уже удалили в другой вкладке", async () => {
    const dacha = await createGroup("Дача");
    await db.delete(groups).where(eq(groups.id, dacha));

    // No error: the page just shows the list without this group
    await expect(deleteGroupAction(dacha)).resolves.toBeUndefined();

    expect(await db.select().from(groups)).toEqual([]);
    expect(revalidatePath).toHaveBeenCalled();
  });
});
