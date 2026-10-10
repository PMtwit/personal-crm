import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ContactList, ContactListSkeleton } from "@/components/contact-list";
import { SearchBox, SearchBoxFallback } from "@/components/search-box";
import { buttonVariants } from "@/components/ui/button";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-4 bg-background/95 px-4 pt-2 pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
          <Link href="/contacts/new" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden />
            Добавить контакт
          </Link>
        </div>
        <Suspense fallback={<SearchBoxFallback />}>
          <SearchBox />
        </Suspense>
      </div>
      <Suspense fallback={<ContactListSkeleton />}>
        <ContactList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
