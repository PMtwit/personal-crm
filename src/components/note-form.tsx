"use client";

import { useActionState } from "react";

import { addNoteAction, type NoteFormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ contactId }: { contactId: number }) {
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(
    addNoteAction.bind(null, contactId),
    {},
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor="note-body" className="sr-only">
          Новая заметка
        </FieldLabel>
        <Textarea
          id="note-body"
          name="body"
          rows={3}
          defaultValue={state.body}
          placeholder="О чём поговорили, о чём договорились…"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "note-body-error" : undefined}
          onKeyDown={(event) => {
            // Cmd+Enter / Ctrl+Enter saves the note
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {state.error ? (
          <FieldError id="note-body-error">{state.error}</FieldError>
        ) : null}
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
        <span className="hidden text-sm text-subtle sm:inline">
          или ⌘/Ctrl + Enter
        </span>
      </div>
    </form>
  );
}
