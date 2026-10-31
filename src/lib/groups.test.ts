import { describe, expect, it } from "vitest";

import { homeHref, listCaption, resolveSelectedGroup } from "@/lib/groups";

const groups = [
  { id: 3, name: "Дача" },
  { id: 7, name: "Семья" },
];

describe("resolveSelectedGroup", () => {
  it("По умолчанию все", () => {
    expect(resolveSelectedGroup(undefined, groups)).toBeNull();
  });

  it("Выбрана группа из адреса", () => {
    expect(resolveSelectedGroup("7", groups)).toEqual({ id: 7, name: "Семья" });
  });

  it("Группы из адреса больше нет", () => {
    expect(resolveSelectedGroup("99", groups)).toBeNull();
  });

  it("Неверный id в адресе — тоже «Все»", () => {
    for (const bad of ["", "abc", "0", "-3", "3.5", "3abc", "99999999999"]) {
      expect(resolveSelectedGroup(bad, groups)).toBeNull();
    }
  });

  it("Если параметр повторён, берётся первый", () => {
    expect(resolveSelectedGroup(["3", "7"], groups)).toEqual({
      id: 3,
      name: "Дача",
    });
  });
});

describe("homeHref", () => {
  it("Без запроса и группы — просто главная", () => {
    expect(homeHref({})).toBe("/");
    expect(homeHref({ q: "", group: null })).toBe("/");
  });

  it("Запрос не сбрасывает группу", () => {
    expect(homeHref({ q: "Ан", group: 3 })).toBe(
      `/?q=${encodeURIComponent("Ан")}&group=3`,
    );
  });

  it("Группа не стирает запрос", () => {
    const href = homeHref({ q: "Ан Б", group: 7 });
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("q")).toBe("Ан Б");
    expect(params.get("group")).toBe("7");
  });

  it("Пустые параметры не пишутся", () => {
    expect(homeHref({ q: "Ан", group: null })).toBe(
      `/?q=${encodeURIComponent("Ан")}`,
    );
    expect(homeHref({ q: "", group: 3 })).toBe("/?group=3");
  });

  it("Открыл группу со страницы", () => {
    expect(homeHref({ group: 7 })).toBe("/?group=7");
  });
});

// "1 000": Russian formatting puts a no-break space between thousands
const thousand = (1000).toLocaleString("ru-RU");

describe("listCaption", () => {
  it("Вернулся ко всем", () => {
    expect(
      listCaption({ query: "", group: null, shown: 1000, total: 1000 }),
    ).toEqual({
      caption: `Всего ${thousand} контактов`,
      empty: null,
    });
  });

  it("Сколько в группе", () => {
    expect(
      listCaption({ query: "", group: { name: "Семья" }, shown: 5, total: 5 }),
    ).toEqual({ caption: "В группе «Семья» 5 контактов", empty: null });
  });

  it("Один контакт в группе — правильная форма слова", () => {
    expect(
      listCaption({ query: "", group: { name: "Семья" }, shown: 1, total: 1 })
        .caption,
    ).toBe("В группе «Семья» 1 контакт");
  });

  it("Пустая группа", () => {
    expect(
      listCaption({ query: "", group: { name: "Дача" }, shown: 0, total: 0 }),
    ).toEqual({
      caption: null,
      empty:
        "В группе «Дача» пока никого. Добавить человека в группу можно в его карточке.",
    });
  });

  it("Поиск внутри группы", () => {
    expect(
      listCaption({
        query: "Ан",
        group: { name: "Семья" },
        shown: 1,
        total: 5,
      }),
    ).toEqual({ caption: "Найдено: 1 из 5", empty: null });
  });

  it("Поиск без группы", () => {
    expect(
      listCaption({ query: "Ан", group: null, shown: 12, total: 1000 }),
    ).toEqual({
      caption: `Найдено: 12 из ${thousand}`,
      empty: null,
    });
  });

  it("Никого не нашлось без группы", () => {
    expect(
      listCaption({ query: "Ян", group: null, shown: 0, total: 30 }),
    ).toEqual({
      caption: "Найдено: 0 из 30",
      empty: "Никого не нашлось по запросу «Ян»",
    });
  });

  it("Никого не нашлось в группе", () => {
    expect(
      listCaption({ query: "Ян", group: { name: "Дача" }, shown: 0, total: 3 }),
    ).toEqual({
      caption: "Найдено: 0 из 3",
      empty: "Никого не нашлось по запросу «Ян» в группе «Дача»",
    });
  });

  it("Никого не нашлось в пустой группе", () => {
    expect(
      listCaption({ query: "Ян", group: { name: "Дача" }, shown: 0, total: 0 }),
    ).toEqual({
      caption: null,
      empty: "Никого не нашлось по запросу «Ян» в группе «Дача»",
    });
  });
});
