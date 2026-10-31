"use client";

import { CircleAlert, LoaderCircle, Settings } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useOptimistic } from "react";

import {
  setContactGroupAction,
  type ContactGroupFormState,
} from "@/app/actions";
import { NewGroupDialog } from "@/components/new-group-dialog";

type GroupChange = { groupId: number; member: boolean };

// "Groups" in the contact card: a pill for every group, the ones the contact
// is in are dark. One click adds the contact to the group or takes it out and
// saves at once, there is no "Save" button
export function ContactGroupsPicker({
  contactId,
  contactName,
  groups,
  memberOf,
}: {
  contactId: number;
  contactName: string;
  groups: { id: number; name: string }[];
  // Ids of the groups the contact is really in (saved in the database)
  memberOf: number[];
}) {
  const [state, formAction, pending] = useActionState<
    ContactGroupFormState,
    FormData
  >(setContactGroupAction.bind(null, contactId), {});

  // The pill changes at once, without waiting for the server. When the server
  // has answered, the list comes from it again: if saving failed, the pill
  // goes back to what is really saved
  const [shownIds, applyChange] = useOptimistic(
    memberOf,
    (current, { groupId, member }: GroupChange) =>
      member
        ? [...current.filter((id) => id !== groupId), groupId]
        : current.filter((id) => id !== groupId),
  );

  function toggle(groupId: number, member: boolean) {
    const formData = new FormData();
    formData.set("groupId", String(groupId));
    formData.set("member", String(member));
    startTransition(() => {
      applyChange({ groupId, member });
      formAction(formData);
    });
  }

  return (
    <section aria-labelledby="groups-heading" className="flex flex-col gap-3 sm:gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="groups-heading"
          className="text-lg leading-snug font-medium sm:text-xl"
        >
          Группы
        </h2>
        {groups.length > 0 ? (
          <Link
            href="/groups"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-note text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Settings aria-hidden className="size-4" />
            Настроить группы
          </Link>
        ) : null}
      </div>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">Групп пока нет</p>
      ) : null}
      <div role="group" aria-labelledby="groups-heading" className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <label
            key={group.id}
            className="relative inline-flex h-11 max-w-full cursor-pointer items-center rounded-full border border-border bg-background px-4 text-chip font-medium has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring sm:px-4.5"
          >
            <input
              type="checkbox"
              checked={shownIds.includes(group.id)}
              onChange={(event) => toggle(group.id, event.target.checked)}
              className="sr-only"
            />
            <span className="truncate">{group.name}</span>
          </label>
        ))}
        <NewGroupDialog contactId={contactId} contactName={contactName} />
      </div>
      <div aria-live="polite" className="min-h-6 sm:min-h-6.5">
        {pending ? (
          <p className="flex items-center gap-2 text-chip text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            Сохраняю…
          </p>
        ) : state.error ? (
          <p
            role="alert"
            className="flex items-center gap-2 text-chip text-destructive"
          >
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            {state.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
