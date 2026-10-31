import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { DeleteGroupButton } from "@/components/delete-group-button";
import { RenameGroupDialog } from "@/components/rename-group-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroups } from "@/lib/data";
import { contactsCount } from "@/lib/format";
import { homeHref } from "@/lib/groups";

export const metadata: Metadata = {
  title: "Группы",
};

export default function GroupsPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="text-title font-medium text-balance sm:text-title-lg">
        Группы
      </h1>
      <Suspense fallback={<GroupsSkeleton />}>
        <GroupsList />
      </Suspense>
    </div>
  );
}

async function GroupsList() {
  const groups = await listGroups();

  if (groups.length === 0) {
    return (
      <p className="rounded-card bg-muted px-6 py-12 text-center text-muted-foreground sm:rounded-card-lg">
        Групп пока нет. Создать группу можно в карточке контакта.
      </p>
    );
  }

  return (
    <ul aria-label="Список групп" className="flex flex-col gap-0.5">
      {groups.map((group) => (
        <li
          key={group.id}
          className="flex items-center gap-3 rounded-card px-3 py-2 transition-colors hover:bg-muted"
        >
          {/* The name opens the home page with this group chosen in the filter */}
          <Link
            href={homeHref({ group: group.id })}
            className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-note outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="truncate font-medium">{group.name}</span>
            <span className="text-sm text-muted-foreground">
              {contactsCount(group.contactCount)}
            </span>
          </Link>
          <div className="flex shrink-0 gap-2">
            <RenameGroupDialog groupId={group.id} name={group.name} />
            <DeleteGroupButton groupId={group.id} name={group.name} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function GroupsSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-busy aria-label="Загружаю группы">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="size-11 rounded-button" />
          <Skeleton className="size-11 rounded-button" />
        </div>
      ))}
    </div>
  );
}
