"use client";

import { Cake } from "lucide-react";
import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import { ExpandableList } from "@/components/expandable-list";

export type BirthdayItem = {
  id: number;
  name: string;
  // "18 ноября"
  dateLabel: string;
  // "сегодня", "завтра", "через 3 дня"
  whenLabel: string;
  // "исполнится 36 лет"; null when the year is not known
  turningLabel: string | null;
};

// The same shape as "Time to get in touch", but calm: a gray background instead
// of the gradient and the number in the usual text color. A birthday is not
// something overdue
export function BirthdaysList({ contacts }: { contacts: BirthdayItem[] }) {
  return (
    <section
      aria-labelledby="birthdays-heading"
      className="flex flex-col gap-3 rounded-card-lg bg-muted px-2 pt-4 pb-2 sm:gap-3.5 sm:rounded-block sm:px-3 sm:pt-5 sm:pb-3"
    >
      <div className="flex items-center gap-2.5 px-2 sm:px-3">
        <Cake
          aria-hidden
          className="size-5 shrink-0 text-muted-foreground sm:size-6"
        />
        <h2
          id="birthdays-heading"
          className="text-section font-medium sm:text-section-lg"
        >
          Скоро день рождения
        </h2>
        <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-background px-2 text-sm font-bold sm:h-6.5 sm:min-w-7.5 sm:px-2.5 sm:text-chip">
          {contacts.length}
        </span>
      </div>
      <ExpandableList
        items={contacts}
        label="У кого скоро день рождения"
        renderItem={(contact) => <BirthdayRow contact={contact} />}
      />
    </section>
  );
}

// Two lines: the name and when, then the date and how old the person turns.
// The whole row opens the contact's card: the name is a link stretched over
// the row (::after). No buttons in the row
function BirthdayRow({ contact }: { contact: BirthdayItem }) {
  return (
    <div className="group relative flex items-center gap-3 rounded-button p-2 transition-colors has-focus-visible:bg-muted hover:bg-muted sm:gap-3.5 sm:rounded-note-lg sm:px-3">
      {/* The row turns gray on hover, so the gray avatar turns white */}
      <ContactAvatar
        name={contact.name}
        className="group-hover:bg-background group-has-focus-visible:bg-background"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-6 min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href={`/contacts/${contact.id}`}
            className="min-w-0 flex-1 truncate leading-6 font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit]"
          >
            {contact.name}
          </Link>
          <span className="shrink-0 text-meta font-medium whitespace-nowrap sm:text-sm">
            {contact.whenLabel}
          </span>
        </div>
        <div className="flex h-5 min-w-0 items-center justify-between gap-2 sm:h-5.5 sm:gap-3">
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {contact.dateLabel}
          </span>
          {contact.turningLabel ? (
            <span className="shrink-0 text-meta whitespace-nowrap text-muted-foreground sm:text-sm">
              {contact.turningLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
