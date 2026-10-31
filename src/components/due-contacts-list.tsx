"use client";

import Link from "next/link";
import { useState } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
import { MarkContactedDialog } from "@/components/mark-contacted-dialog";
import { Button } from "@/components/ui/button";

// How many contacts are shown before "Show all"
const VISIBLE_COUNT = 5;

export type DueContactItem = {
  id: number;
  name: string;
  intervalLabel: string;
  overdueLabel: string;
};

export function DueContactsList({ contacts }: { contacts: DueContactItem[] }) {
  // Kept in the component: after going to another page and back the block is folded again
  const [expanded, setExpanded] = useState(false);
  const hasMore = contacts.length > VISIBLE_COUNT;
  const visible = expanded ? contacts : contacts.slice(0, VISIBLE_COUNT);

  return (
    <section
      aria-labelledby="due-contacts-heading"
      className="flex flex-col gap-3 rounded-card-lg bg-linear-160/srgb from-hero-from to-hero-to px-2 pt-4 pb-2 sm:gap-3.5 sm:rounded-block sm:px-3 sm:pt-5 sm:pb-3"
    >
      <div className="flex items-center gap-2.5 px-2 sm:px-3">
        <h2
          id="due-contacts-heading"
          className="text-section font-medium sm:text-section-lg"
        >
          Пора связаться
        </h2>
        <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-background px-2 text-sm font-bold text-destructive sm:h-6.5 sm:min-w-7.5 sm:px-2.5 sm:text-chip">
          {contacts.length}
        </span>
      </div>
      <ul
        aria-label="Кому пора написать или позвонить"
        className="flex flex-col gap-0.5 rounded-card bg-card p-1 shadow-card sm:rounded-card-lg sm:p-1.5 sm:shadow-card-lg"
      >
        {visible.map((contact) => (
          <li key={contact.id}>
            <DueContactRow contact={contact} />
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button
          variant="outline"
          onClick={() => setExpanded(!expanded)}
          className="w-full sm:ml-1 sm:w-fit sm:self-start"
        >
          {expanded ? "Свернуть" : `Показать всех (${contacts.length})`}
        </Button>
      ) : null}
    </section>
  );
}

// Two lines: the name and the button, then the interval and how overdue.
// The whole row opens the contact's card: the name is a link stretched over
// the row (::after). The button lies above it (z-10) and is outside the link,
// as HTML does not allow a button inside a link
function DueContactRow({ contact }: { contact: DueContactItem }) {
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
          <MarkContactedDialog contactId={contact.id} name={contact.name} />
        </div>
        <div className="flex h-5 min-w-0 items-center justify-between gap-2 sm:h-5.5 sm:gap-3">
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {contact.intervalLabel}
          </span>
          <span className="shrink-0 text-meta font-medium whitespace-nowrap text-destructive sm:text-sm">
            {contact.overdueLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
