import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { updateContactAction } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact } from "@/lib/data";
import { parseContactId, toContactValues } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Изменить контакт",
};

export default function EditContactPage({
  params,
}: PageProps<"/contacts/[id]/edit">) {
  return (
    <Suspense fallback={<EditContactSkeleton />}>
      <EditContact params={params} />
    </Suspense>
  );
}

async function EditContact({
  params,
}: {
  params: PageProps<"/contacts/[id]/edit">["params"];
}) {
  const id = parseContactId((await params).id);
  if (id === null) {
    notFound();
  }
  const contact = await getContact(id);
  if (!contact) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/contacts/${contact.id}`}>{contact.name}</BackLink>
      <h1 className="text-title font-medium text-balance sm:text-title-lg">
        Изменить контакт
      </h1>
      <ContactForm
        // A new key after each save, so the form never shows stale values
        key={contact.updatedAt.toISOString()}
        action={updateContactAction.bind(null, contact.id)}
        initialValues={toContactValues(contact)}
        submitLabel="Сохранить"
        cancelHref={`/contacts/${contact.id}`}
      />
    </div>
  );
}

function EditContactSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-label="Загружаю контакт">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full rounded-note" />
        </div>
      ))}
    </div>
  );
}
