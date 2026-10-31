import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ContactList, ContactListSkeleton } from "@/components/contact-list";
import { DeletedNotice } from "@/components/deleted-notice";
import { DueContacts } from "@/components/due-contacts";
import { GroupFilter } from "@/components/group-filter";
import { SearchBox, SearchBoxFallback } from "@/components/search-box";
import { buttonVariants } from "@/components/ui/button";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-4 bg-background/95 px-4 pt-2 pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title font-medium text-balance sm:text-title-lg">
            Контакты
          </h1>
          {/* On phones the wide button text doesn't fit next to the title: only "+" is shown */}
          <Link
            href="/contacts/new"
            className={buttonVariants({
              className: "max-sm:size-11 max-sm:px-0",
            })}
          >
            <Plus aria-hidden className="size-4 max-sm:size-5" />
            <span className="max-sm:sr-only">Добавить контакт</span>
          </Link>
        </div>
        <Suspense fallback={<SearchBoxFallback />}>
          <SearchBox />
        </Suspense>
        <Suspense fallback={null}>
          <GroupFilter searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={null}>
          <DeletedNotice />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <DueContacts searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ContactListSkeleton />}>
        <ContactList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
