import { Settings } from "lucide-react";
import Link from "next/link";

import { listGroups } from "@/lib/data";
import { homeHref, resolveSelectedGroup } from "@/lib/groups";

const pillClasses =
  "inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background px-4 text-chip font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// The row under the search box: "All" and the groups by name. The chosen one is
// dark. Links, not buttons: the choice lives in the address (?group=), so it
// survives a reload and works with the Back button. The search query stays in
// the address when a group is chosen. One line, it scrolls sideways inside itself.
// There are no groups - there is no row
export async function GroupFilter({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, group: groupParam } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  const groups = await listGroups();
  if (groups.length === 0) {
    return null;
  }
  const selected = resolveSelectedGroup(groupParam, groups);

  return (
    <nav
      aria-label="Группы"
      // Reaches the screen edges: the pills scroll under them, not under the page margin.
      // "relative": the screen-reader-only text (absolutely positioned) must stay
      // inside the row and not stretch the page sideways
      className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      <Link
        href={homeHref({ q: query })}
        aria-current={selected === null ? "page" : undefined}
        className={`${pillClasses} aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background not-aria-[current=page]:hover:bg-muted`}
      >
        Все
      </Link>
      {groups.map((group) => (
        <Link
          key={group.id}
          href={homeHref({ q: query, group: group.id })}
          aria-current={selected?.id === group.id ? "page" : undefined}
          className={`${pillClasses} aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background not-aria-[current=page]:hover:bg-muted`}
        >
          {group.name}
        </Link>
      ))}
      {/* On phones only the icon; the text is for screen readers */}
      <Link
        href="/groups"
        className={`${pillClasses} gap-2 text-muted-foreground hover:bg-muted hover:text-foreground max-sm:w-10 max-sm:justify-center max-sm:px-0`}
      >
        <Settings aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Настроить группы</span>
      </Link>
    </nav>
  );
}
