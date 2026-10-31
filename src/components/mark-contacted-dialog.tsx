"use client";

import { useActionState, useState } from "react";

import { addNoteAction, type NoteFormState } from "@/app/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { CONTACTED_NOTE_BODY } from "@/lib/keep-in-touch";

// The "Already talked" button in a row of the "Time to get in touch" block.
// It only opens a dialog with a new note that already says "Связался":
// nothing is written until "Save". Cancel, Esc or a click outside close
// the dialog and change nothing. The saved note restarts the countdown,
// so the contact leaves the block
export function MarkContactedDialog({
  contactId,
  name,
}: {
  contactId: number;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // While the note is being saved the dialog stays open
        if (!saving) {
          setOpen(nextOpen);
        }
      }}
    >
      {/* Short label on phones, whole one on wider screens. The button is as tall
          as the name's line (24px); the touch area is bigger (36px): a pseudo-element
          reaches up and to the sides, but not down to the line below */}
      <DialogTrigger
        render={
          <Button
            variant="secondary"
            size="xs"
            aria-label={`Уже связался: ${name}`}
            className="relative z-10 h-6 rounded-sm px-2.5 text-button-sm before:absolute before:-top-2 before:-right-1.5 before:-bottom-1 before:-left-1.5 before:content-[''] sm:px-3"
          />
        }
      >
        {/* One element: the button is a flex container, and inside it the space
            before "связался" would be lost */}
        <span>
          Уже<span className="max-sm:hidden"> связался</span>
        </span>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {/* The form lives only while the dialog is open: every time it opens,
            it starts again with the text "Связался" and without old errors */}
        <ContactedNoteForm
          contactId={contactId}
          name={name}
          onSavingChange={setSaving}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// Focus in the field, the cursor after the text: add to it or replace it.
// A stable function, so React calls it once, when the field appears
function focusAtEnd(textarea: HTMLTextAreaElement | null) {
  if (textarea) {
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }
}

function ContactedNoteForm({
  contactId,
  name,
  onSavingChange,
  onSaved,
}: {
  contactId: number;
  name: string;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(
    async (previousState, formData) => {
      // A second press of "Save" (or Ctrl+Enter) waits in line while the first note is
      // being written, and starts when it is done: by then the note exists, skip it
      if (previousState.saved) {
        return previousState;
      }
      onSavingChange(true);
      try {
        const result = await addNoteAction(contactId, previousState, formData);
        if (result.saved) {
          onSaved();
        }
        return result;
      } finally {
        onSavingChange(false);
      }
    },
    { body: CONTACTED_NOTE_BODY },
  );
  const bodyId = `contacted-note-${contactId}`;

  return (
    <form action={formAction} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Новая заметка</DialogTitle>
        <DialogDescription>
          {name}. После сохранения срок отсчитывается заново.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor={bodyId} className="sr-only">
          Текст заметки
        </FieldLabel>
        <Textarea
          id={bodyId}
          name="body"
          rows={3}
          defaultValue={state.body}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${bodyId}-error` : undefined}
          ref={focusAtEnd}
          onKeyDown={(event) => {
            // Cmd+Enter / Ctrl+Enter saves the note
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {state.error ? (
          <FieldError id={`${bodyId}-error`}>{state.error}</FieldError>
        ) : null}
        <p className="hidden text-sm text-muted-foreground sm:block">
          Сохранить: ⌘/Ctrl + Enter
        </p>
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
