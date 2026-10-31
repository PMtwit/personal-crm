"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createGroupForContactAction,
  type GroupNameFormState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// The "New group" pill at the end of the contact card's groups. It only opens a
// dialog: nothing is created until "Create". Cancel, Esc or a click outside
// close the dialog and change nothing. The new group gets this contact at once
export function NewGroupDialog({
  contactId,
  contactName,
}: {
  contactId: number;
  contactName: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // While the group is being created the dialog stays open
        if (!saving) {
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full border border-dashed border-border bg-background px-4 text-chip font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-4.5"
          />
        }
      >
        <Plus aria-hidden className="size-4 shrink-0" />
        Новая группа
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {/* The form lives only while the dialog is open: every time it opens,
            it starts empty and without old errors */}
        <NewGroupForm
          contactId={contactId}
          contactName={contactName}
          onSavingChange={setSaving}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewGroupForm({
  contactId,
  contactName,
  onSavingChange,
  onSaved,
}: {
  contactId: number;
  contactName: string;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    GroupNameFormState,
    FormData
  >(async (previousState, formData) => {
    // A second press of "Create" waits in line while the first group is being
    // made, and starts when it is done: by then the group exists, skip it
    if (previousState.saved) {
      return previousState;
    }
    onSavingChange(true);
    try {
      const result = await createGroupForContactAction(
        contactId,
        previousState,
        formData,
      );
      if (result.saved) {
        onSaved();
      }
      return result;
    } finally {
      onSavingChange(false);
    }
  }, {});
  const nameId = `new-group-name-${contactId}`;

  return (
    <form action={formAction} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Новая группа</DialogTitle>
        <DialogDescription>{contactName} сразу войдёт в неё.</DialogDescription>
      </DialogHeader>
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor={nameId}>Название</FieldLabel>
        <Input
          id={nameId}
          name="name"
          autoComplete="off"
          defaultValue={state.name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${nameId}-error` : undefined}
        />
        {state.error ? (
          <FieldError id={`${nameId}-error`}>{state.error}</FieldError>
        ) : null}
      </Field>
      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" type="button" />}
          disabled={pending}
        >
          Отмена
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Создаю…" : "Создать"}
        </Button>
      </DialogFooter>
    </form>
  );
}
