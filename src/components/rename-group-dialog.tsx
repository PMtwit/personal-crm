"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { renameGroupAction, type GroupNameFormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// The "Rename" button of a group on the "Groups" page. It opens a dialog with
// the current name: nothing changes until "Save". Cancel, Esc or a click
// outside close the dialog and change nothing
export function RenameGroupDialog({
  groupId,
  name,
}: {
  groupId: number;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // While the name is being saved the dialog stays open
        if (!saving) {
          setOpen(nextOpen);
        }
      }}
    >
      {/* On phones only the icon; the name for screen readers says which group */}
      <DialogTrigger
        render={
          <Button
            variant="outline"
            aria-label={`Переименовать «${name}»`}
            className="max-sm:size-11 max-sm:px-0"
          />
        }
      >
        <Pencil aria-hidden />
        <span className="max-sm:hidden">Переименовать</span>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {/* The form lives only while the dialog is open: every time it opens,
            it starts with the group's current name and without old errors */}
        <RenameGroupForm
          groupId={groupId}
          name={name}
          onSavingChange={setSaving}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameGroupForm({
  groupId,
  name,
  onSavingChange,
  onSaved,
}: {
  groupId: number;
  name: string;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    GroupNameFormState,
    FormData
  >(async (previousState, formData) => {
    // A second press of "Save" waits in line while the first one is being
    // saved, and starts when it is done: by then the name is saved, skip it
    if (previousState.saved) {
      return previousState;
    }
    onSavingChange(true);
    try {
      const result = await renameGroupAction(groupId, previousState, formData);
      if (result.saved) {
        onSaved();
      }
      return result;
    } finally {
      onSavingChange(false);
    }
  }, {});
  const nameId = `rename-group-${groupId}`;

  return (
    <form action={formAction} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Переименовать группу</DialogTitle>
      </DialogHeader>
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor={nameId}>Название</FieldLabel>
        <Input
          id={nameId}
          name="name"
          autoComplete="off"
          defaultValue={state.name ?? name}
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
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </form>
  );
}
