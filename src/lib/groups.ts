import { contactsCount } from "@/lib/format";
import { parseId } from "@/lib/validation";

// Pure helpers for the group filter on the home page. They know nothing about
// the database, so tests check them without it

// The group chosen by ?group= in the address, or null, which means "All".
// A wrong id, or a group that has been deleted since the link was made, is
// also "All": the page never breaks because of the address
export function resolveSelectedGroup<Group extends { id: number }>(
  param: string | string[] | undefined,
  groups: Group[],
): Group | null {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = raw === undefined ? null : parseId(raw);
  return groups.find((group) => group.id === id) ?? null;
}

// The home page's address with the search query and the group. What is empty
// is not written, so the plain home page stays "/". Search and the filter
// build their links here, so one never wipes the other
export function homeHref({
  q,
  group,
}: {
  q?: string;
  group?: number | null;
}): string {
  const params = [
    q ? `q=${encodeURIComponent(q)}` : null,
    group ? `group=${group}` : null,
  ].filter((param) => param !== null);
  return params.length > 0 ? `/?${params.join("&")}` : "/";
}

export type ListCaption = {
  // The line above the list; null if there is none
  caption: string | null;
  // The text that stands in place of the list; null if the list is shown
  empty: string | null;
};

// Texts of the contact list for what is chosen: all contacts or a group,
// with a search query or without. `shown` is how many contacts the list has,
// `total` how many there are in the group (or in all, with no group), whatever the query
export function listCaption({
  query,
  group,
  shown,
  total,
}: {
  query: string;
  group: { name: string } | null;
  shown: number;
  total: number;
}): ListCaption {
  if (query) {
    return {
      caption:
        total === 0
          ? null
          : `Найдено: ${shown.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")}`,
      empty:
        shown === 0
          ? `Никого не нашлось по запросу «${query}»${group ? ` в группе «${group.name}»` : ""}`
          : null,
    };
  }
  if (!group) {
    return { caption: `Всего ${contactsCount(total)}`, empty: null };
  }
  if (total === 0) {
    return {
      caption: null,
      empty: `В группе «${group.name}» пока никого. Добавить человека в группу можно в его карточке.`,
    };
  }
  return {
    caption: `В группе «${group.name}» ${contactsCount(total)}`,
    empty: null,
  };
}
