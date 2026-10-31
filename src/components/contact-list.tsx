import { Plus } from "lucide-react";
import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  countContacts,
  listContacts,
  listGroups,
  type ContactListItem,
} from "@/lib/data";
import { groupLetter } from "@/lib/format";
import { listCaption, resolveSelectedGroup } from "@/lib/groups";

export async function ContactList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, group: groupParam } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const group = resolveSelectedGroup(groupParam, await listGroups());
  const groupId = group?.id ?? null;
  // `total` is in the group (or in all, with no group); `allTotal` is in all
  const [items, total, allTotal] = await Promise.all([
    listContacts(query, groupId),
    countContacts(groupId),
    group ? countContacts() : null,
  ]);

  if ((allTotal ?? total) === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-block bg-linear-160/srgb from-hero-from to-hero-to px-5 py-14 text-center sm:rounded-block-lg sm:py-16">
        <p className="text-lg text-muted-foreground">
          Пока нет ни одного контакта
        </p>
        <Link href="/contacts/new" className={buttonVariants({ size: "lg" })}>
          <Plus aria-hidden />
          Добавить первый контакт
        </Link>
      </div>
    );
  }

  const { caption, empty } = listCaption({
    query,
    group,
    shown: items.length,
    total,
  });

  return (
    <section aria-label="Список контактов" className="flex flex-col gap-4">
      {caption ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {caption}
        </p>
      ) : null}
      {empty ? (
        <p className="rounded-card bg-muted px-6 py-12 text-center text-muted-foreground sm:rounded-card-lg">
          {empty}
        </p>
      ) : (
        groupByLetter(items).map(([letter, letterContacts]) => (
          <div key={letter}>
            <h2 className="mb-1 px-3 font-display text-sm font-bold text-primary">
              {letter}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {letterContacts.map((contact) => (
                <li key={contact.id}>
                  <ContactRow contact={contact} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function ContactRow({ contact }: { contact: ContactListItem }) {
  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="group flex items-center gap-3 rounded-card px-3 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      {/* The row turns gray on hover, so the gray avatar turns white */}
      <ContactAvatar
        name={contact.name}
        className="group-hover:bg-background group-focus-visible:bg-background"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{contact.name}</span>
        {contact.about ? (
          <span className="truncate text-sm text-muted-foreground">
            {contact.about}
          </span>
        ) : null}
      </span>
      {contact.phone ? (
        <span className="hidden shrink-0 text-sm text-muted-foreground tabular-nums sm:block">
          {contact.phone}
        </span>
      ) : null}
    </Link>
  );
}

function groupByLetter(
  items: ContactListItem[],
): [string, ContactListItem[]][] {
  const groups = new Map<string, ContactListItem[]>();
  for (const item of items) {
    const letter = groupLetter(item.name);
    const group = groups.get(letter);
    if (group) {
      group.push(item);
    } else {
      groups.set(letter, [item]);
    }
  }
  return [...groups.entries()];
}

export function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Загружаю контакты">
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-12 rounded-avatar" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
