"use client";

import { useActionState } from "react";

import {
  requestSignInLinkAction,
  type SignInFormState,
} from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<
    SignInFormState,
    FormData
  >(requestSignInLinkAction, {});

  return (
    <form
      action={formAction}
      // The server checks the address and answers "Проверь адрес почты"
      noValidate
      className="flex w-full max-w-sm flex-col gap-4 text-left"
    >
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor="email">Почта</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          // What was typed stays in the field; after a letter, the cleaned address
          defaultValue={state.email}
          className="bg-background"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
        />
        {state.error ? (
          <FieldError id="email-error">{state.error}</FieldError>
        ) : null}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Отправляю…" : "Получить ссылку"}
      </Button>
      {state.sentTo ? (
        <p role="status" className="text-pretty text-muted-foreground">
          Ссылка для входа отправлена на {state.sentTo}
        </p>
      ) : null}
    </form>
  );
}
