import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { NoteForm } from "@/components/note-form";
import { buttonVariants } from "@/components/ui/button";
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
      {/* As the landing's first screen: a gradient block with a white card */}
      <header className="-mx-1 flex flex-col gap-5 rounded-block bg-linear-160/srgb from-hero-from to-hero-to p-5 sm:mx-0 sm:gap-6 sm:rounded-block-lg sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <ContactAvatar
            name={contact.name}
            className="size-16 rounded-avatar-lg bg-background text-avatar-lg"
          />
          <Link
            href={`/contacts/${contact.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Pencil aria-hidden />
            Изменить
          </Link>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title font-medium break-words text-balance sm:text-title-lg">
            {contact.name}
          </h1>
          {contact.about ? (
            <p className="text-pretty text-muted-foreground sm:text-lg">
              {contact.about}
            </p>
          ) : null}
        </div>

        <dl className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-card sm:rounded-card-lg sm:p-6 sm:shadow-card-lg">
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
      </header>

      <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
        <h2
          id="notes-heading"
          className="flex items-baseline gap-2.5 text-lg font-medium sm:text-xl"
        >
          Заметки
          {notes.length > 0 ? (
            <span className="text-sm font-normal text-muted-foreground sm:text-base">
              {notesCount(notes.length)}
            </span>
          ) : null}
        </h2>
        <NoteForm key={contact.id} contactId={contact.id} />
        {notes.length === 0 ? (
          <p className="mt-2 text-muted-foreground">Заметок пока нет</p>
        ) : (
          <ol
            className="mt-2 flex flex-col gap-2 sm:gap-3"
            aria-label="Заметки о контакте"
          >
            {notes.map((note) => (
              <li
                key={note.id}
                className="flex flex-col gap-1 rounded-note bg-muted px-4 py-3 sm:gap-1.5 sm:rounded-note-lg sm:px-5 sm:py-4"
              >
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="text-xs text-subtle sm:text-sm"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
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
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="text-sm text-muted-foreground sm:text-base">{label}</dt>
      <dd className="min-w-0">
        {children ?? <span className="text-subtle">не указано</span>}
      </dd>
    </div>
  );
}

function ContactCardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy aria-label="Загружаю контакт">
      <div className="-mx-1 flex flex-col gap-5 rounded-block bg-muted p-5 sm:mx-0 sm:rounded-block-lg sm:p-8">
        <Skeleton className="size-16 rounded-avatar-lg bg-background" />
        <Skeleton className="h-8 w-56 bg-background" />
        <Skeleton className="h-36 w-full rounded-card bg-background sm:rounded-card-lg" />
      </div>
      <Skeleton className="h-24 w-full rounded-note sm:rounded-note-lg" />
    </div>
  );
}
