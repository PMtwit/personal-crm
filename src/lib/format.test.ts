import { describe, expect, it } from "vitest";

import { contactsCount } from "@/lib/format";

describe("contactsCount", () => {
  it("1 -> «1 контакт»", () => {
    expect(contactsCount(1)).toBe("1 контакт");
  });

  it("3 -> «3 контакта»", () => {
    expect(contactsCount(3)).toBe("3 контакта");
  });

  it("5 -> «5 контактов»", () => {
    expect(contactsCount(5)).toBe("5 контактов");
  });

  it("0, 11 and 21 take the right form", () => {
    expect(contactsCount(0)).toBe("0 контактов");
    expect(contactsCount(11)).toBe("11 контактов");
    expect(contactsCount(21)).toBe("21 контакт");
  });
});
