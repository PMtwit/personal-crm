import { Plus } from "lucide-react";
import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { countContacts, listContacts, type ContactListItem } from "@/lib/data";
import { contactsCount, groupLetter } from "@/lib/format";

export async function ContactList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const [items, total] = await Promise.all([
    listContacts(query),
    countContacts(),
  ]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
        <p className="text-muted-foreground">Пока нет ни одного контакта</p>
        <Link href="/contacts/new" className={buttonVariants()}>
          <Plus aria-hidden />
          Добавить первый контакт
        </Link>
      </div>
    );
  }

  return (
    <section aria-label="Список контактов" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {query
          ? `Найдено: ${items.length.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")}`
          : `Всего ${contactsCount(total)}`}
      </p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
          Никого не нашлось по запросу «{query}»
        </p>
      ) : (
        groupByLetter(items).map(([letter, group]) => (
          <div key={letter}>
            <h2 className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground">
              {letter}
            </h2>
            <ul className="flex flex-col">
              {group.map((contact) => (
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <ContactAvatar name={contact.name} />
      <span className="flex min-w-0 flex-1 flex-col">
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
            <Skeleton className="size-10 rounded-full" />
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
