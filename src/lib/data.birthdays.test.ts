import { beforeEach, describe, expect, it } from "vitest";

import { listBirthdayContacts } from "@/lib/data";

import {
  addToGroup,
  createContact,
  createContactWithBirthDate,
  createGroup,
  createOwner,
} from "../../test/helpers";

// The rows the "Birthday soon" block is counted from: every contact of the
// user with a birth date, by name. Which of them are soon is counted by
// upcomingBirthdays (birthdays.test.ts)

let owner: string;

beforeEach(async () => {
  owner = await createOwner();
});

async function namesOf(groupId: number | null = null) {
  return (await listBirthdayContacts(owner, groupId)).map((row) => row.name);
}

describe("Блок «Скоро день рождения» на главной", () => {
  it("only contacts with a birth date, with the date's fields", async () => {
    const anna = await createContactWithBirthDate(owner, "Анна", {
      day: 18,
      month: 11,
      year: 1990,
    });
    const boris = await createContactWithBirthDate(owner, "Борис", {
      day: 3,
      month: 1,
    });
    await createContact(owner, "Вера без даты");

    expect(await listBirthdayContacts(owner, null)).toEqual([
      { id: anna, name: "Анна", birthDay: 18, birthMonth: 11, birthYear: 1990 },
      { id: boris, name: "Борис", birthDay: 3, birthMonth: 1, birthYear: null },
    ]);
  });

  it("by name in Russian alphabetical order, the same names by id", async () => {
    for (const name of ["Яна", "Ёлка", "Елена", "Алла"]) {
      await createContactWithBirthDate(owner, name, { day: 1, month: 1 });
    }
    const secondAlla = await createContactWithBirthDate(owner, "Алла", {
      day: 2,
      month: 1,
    });

    const rows = await listBirthdayContacts(owner, null);
    expect(rows.map((row) => row.name)).toEqual([
      "Алла",
      "Алла",
      "Елена",
      "Ёлка",
      "Яна",
    ]);
    expect(rows[1].id).toBe(secondAlla);
  });

  it("nobody with a birth date: an empty list", async () => {
    await createContact(owner, "Анна");

    expect(await namesOf()).toEqual([]);
  });
});

describe("Блок дней рождения учитывает выбранную группу", () => {
  async function familyAndDacha() {
    const family = await createGroup(owner, "Семья");
    const dacha = await createGroup(owner, "Дача");
    const anna = await createContactWithBirthDate(owner, "Анна", {
      day: 16,
      month: 11,
    });
    const vera = await createContactWithBirthDate(owner, "Вера", {
      day: 17,
      month: 11,
    });
    const boris = await createContactWithBirthDate(owner, "Борис", {
      day: 18,
      month: 11,
    });
    await createContactWithBirthDate(owner, "Глеб без группы", {
      day: 19,
      month: 11,
    });
    // In the group, but without a date
    const dmitry = await createContact(owner, "Дмитрий");
    await addToGroup(anna, family);
    await addToGroup(vera, family);
    await addToGroup(vera, dacha);
    await addToGroup(boris, dacha);
    await addToGroup(dmitry, family);
    return { family, dacha };
  }

  it("Только выбранная группа", async () => {
    const { family } = await familyAndDacha();

    expect(await namesOf(family)).toEqual(["Анна", "Вера"]);
  });

  it("Вернулся ко всем", async () => {
    await familyAndDacha();

    expect(await namesOf(null)).toEqual([
      "Анна",
      "Борис",
      "Вера",
      "Глеб без группы",
    ]);
  });

  it("В группе поздравлять некого", async () => {
    await familyAndDacha();
    const empty = await createGroup(owner, "Пустая");

    expect(await namesOf(empty)).toEqual([]);
  });
});
