import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { addNoteAction } from "@/app/actions";
import { DueContacts } from "@/components/due-contacts";
import type { DueContactItem } from "@/components/due-contacts-list";
import { CONTACTED_NOTE_BODY } from "@/lib/keep-in-touch";

import {
  addToGroup,
  createContactWithInterval,
  createGroup,
  formData,
} from "../../test/helpers";

// The "Time to get in touch" block, called as the home page calls it: with the
// parameters of the address. The data is in the test database.
// Returns the names in the block, or null if there is no block
async function dueBlockNames(address: {
  q?: string;
  group?: number;
}): Promise<string[] | null> {
  const block = await DueContacts({
    searchParams: Promise.resolve({
      q: address.q,
      group: address.group === undefined ? undefined : String(address.group),
    }),
  });
  if (block === null) {
    return null;
  }
  const { contacts } = (block as ReactElement<{ contacts: DueContactItem[] }>)
    .props;
  return contacts.map((contact) => contact.name);
}

// A contact whose due date came: "once a week", chosen that many days ago
function overdue(name: string, setDaysAgo: number) {
  return createContactWithInterval(name, { interval: "week", setDaysAgo });
}

// Anna and Vera are in "Семья", Boris is in "Дача"; the time has come for all three
async function familyAndDacha() {
  const anna = await overdue("Анна", 30);
  const vera = await overdue("Вера", 20);
  const boris = await overdue("Борис", 40);
  const family = await createGroup("Семья");
  const dacha = await createGroup("Дача");
  await addToGroup(anna, family);
  await addToGroup(vera, family);
  await addToGroup(boris, dacha);
  return { anna, family };
}

describe("Блок «Пора связаться» учитывает выбранную группу", () => {
  it("Поиск при выбранной группе", async () => {
    const { family } = await familyAndDacha();

    // A query in the search box: no block, even with a group chosen
    expect(await dueBlockNames({ group: family, q: "Ан" })).toBeNull();
    // The query is cleared: the block is back, with the family only
    expect(await dueBlockNames({ group: family })).toEqual(["Анна", "Вера"]);
  });

  it("«Уже связался» при выбранной группе", async () => {
    const { anna, family } = await familyAndDacha();
    expect(await dueBlockNames({ group: family })).toEqual(["Анна", "Вера"]);

    // "Save" in the "New note" dialog with the text it opens with.
    // The action returns instead of redirecting: the page and its address stay
    const result = await addNoteAction(
      anna,
      { body: CONTACTED_NOTE_BODY },
      formData({ body: CONTACTED_NOTE_BODY }),
    );

    expect(result).toEqual({ saved: true });
    expect(await dueBlockNames({ group: family })).toEqual(["Вера"]);
  });
});
