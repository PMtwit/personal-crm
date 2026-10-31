"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import {
  setTouchIntervalAction,
  type TouchIntervalFormState,
} from "@/app/actions";
import {
  touchIntervalLabels,
  touchIntervalOptions,
  type TouchIntervalOption,
  type TouchStatusLine,
} from "@/lib/keep-in-touch";

// "How often to talk": five radio buttons shaped as pills. One click saves,
// there is no "Save" button. Under them is when it is time to get in touch
export function TouchIntervalPicker({
  contactId,
  value,
  status,
}: {
  contactId: number;
  value: TouchIntervalOption;
  status: TouchStatusLine | null;
}) {
  const [state, formAction, pending] = useActionState<
    TouchIntervalFormState,
    FormData
  >(setTouchIntervalAction.bind(null, contactId), {});

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:gap-3.5">
      <fieldset className="flex min-w-0 flex-col gap-3 sm:gap-3.5">
        <legend className="mb-3 p-0 text-lg leading-snug font-medium sm:mb-3.5 sm:text-xl">
          Как часто общаться
        </legend>
        <div className="flex flex-wrap gap-2">
          {touchIntervalOptions.map((option) => (
            <label
              key={option}
              className="relative inline-flex h-11 cursor-pointer items-center rounded-full border border-border bg-background px-4 text-chip font-medium has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring sm:px-4.5"
            >
              {/* Not controlled on purpose: the browser highlights the chosen pill at once.
                  After every action React resets the form to defaultChecked, that is to
                  what is really saved: if saving failed, the old choice comes back */}
              <input
                type="radio"
                name="touchInterval"
                value={option}
                defaultChecked={value === option}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="sr-only"
              />
              {touchIntervalLabels[option]}
            </label>
          ))}
        </div>
      </fieldset>
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
        ) : status?.overdue ? (
          <p className="flex items-center gap-2 font-medium text-destructive">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-primary"
            />
            {status.text}
          </p>
        ) : status ? (
          <p className="text-muted-foreground">{status.text}</p>
        ) : null}
      </div>
    </form>
  );
}
