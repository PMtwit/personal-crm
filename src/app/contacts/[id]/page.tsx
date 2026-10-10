import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { NoteForm } from "@/components/note-form";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, listNotes } from "@/lib/data";
import { formatDateTime, notesCount } from "@/lib/format";
import { parseContactId } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Контакт",
};

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <Suspense fallback={<ContactCardSkeleton />}>
        <ContactCard params={params} />
      </Suspense>
    </div>
  );
}

async function ContactCard({
  params,
}: {
  params: PageProps<"/contacts/[id]">["params"];
}) {
  const id = parseContactId((await params).id);
  if (id === null) {
    notFound();
  }
  const [contact, notes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) {
    notFound();
  }

  return (
    <article className="flex flex-col gap-8">
      <header className="flex items-start gap-4">
        <ContactAvatar name={contact.name} className="size-14 text-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {contact.name}
          </h1>
          {contact.about ? (
            <p className="text-muted-foreground">{contact.about}</p>
          ) : null}
        </div>
        <Link
          href={`/contacts/${contact.id}/edit`}
          className={buttonVariants({ variant: "outline" })}
        >
          <Pencil aria-hidden />
          Изменить
        </Link>
      </header>

      <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 text-sm sm:grid-cols-[9rem_1fr]">
        <DetailRow label="Откуда знакомы">
          {contact.howWeMet ? (
            <span className="whitespace-pre-wrap">{contact.howWeMet}</span>
          ) : null}
        </DetailRow>
        <DetailRow label="Телефон">
          {contact.phone ? (
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
              className="tabular-nums underline-offset-4 hover:underline"
            >
              {contact.phone}
            </a>
          ) : null}
        </DetailRow>
        <DetailRow label="Почта">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="break-all underline-offset-4 hover:underline"
            >
              {contact.email}
            </a>
          ) : null}
        </DetailRow>
      </dl>

      <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
        <h2 id="notes-heading" className="text-lg font-semibold">
          Заметки
          {notes.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {notesCount(notes.length)}
            </span>
          ) : null}
        </h2>
        <NoteForm key={contact.id} contactId={contact.id} />
        <Separator />
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Заметок пока нет</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Заметки о контакте">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border p-4">
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 whitespace-pre-wrap break-words">
                  {note.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        {children ?? <span className="text-muted-foreground/70">не указано</span>}
      </dd>
    </>
  );
}

function ContactCardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy aria-label="Загружаю контакт">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
