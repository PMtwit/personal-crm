"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { createContactAction, type ContactFormState } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContactField, ContactValues } from "@/lib/validation";

type ContactFormProps = {
  action: (
    state: ContactFormState,
    formData: FormData,
  ) => Promise<ContactFormState>;
  initialValues?: ContactValues;
  submitLabel: string;
  cancelHref: string;
};

const emptyValues: ContactValues = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
};

// Next.js keeps visited pages alive; the key gives a clean form every time
// "Add contact" is opened, while the browser Back button keeps the draft
export function NewContactForm() {
  const { bfcacheId } = useRouter();
  return (
    <ContactForm
      key={bfcacheId}
      action={createContactAction}
      submitLabel="Добавить контакт"
      cancelHref="/"
    />
  );
}

export function ContactForm({
  action,
  initialValues = emptyValues,
  submitLabel,
  cancelHref,
}: ContactFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  // After a failed submit show what the user typed, not the initial values
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};

  function fieldProps(field: ContactField) {
    return {
      id: field,
      name: field,
      defaultValue: values[field],
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
    };
  }

  function error(field: ContactField) {
    return errors[field] ? (
      <FieldError id={`${field}-error`}>{errors[field]}</FieldError>
    ) : null;
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="name">Имя</FieldLabel>
          <Input
            {...fieldProps("name")}
            required
            autoFocus
            autoComplete="off"
            placeholder="Например, Анна Смирнова"
          />
          {error("name")}
        </Field>
        <Field data-invalid={errors.about ? true : undefined}>
          <FieldLabel htmlFor="about">Кто это</FieldLabel>
          <Input
            {...fieldProps("about")}
            autoComplete="off"
            placeholder="Например, дизайнер, сестра Олега"
          />
          {error("about")}
        </Field>
        <Field data-invalid={errors.howWeMet ? true : undefined}>
          <FieldLabel htmlFor="howWeMet">Откуда знакомы</FieldLabel>
          <Textarea
            {...fieldProps("howWeMet")}
            rows={2}
            placeholder="Например, учились вместе в университете"
          />
          {error("howWeMet")}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={errors.phone ? true : undefined}>
            <FieldLabel htmlFor="phone">Телефон</FieldLabel>
            <Input
              {...fieldProps("phone")}
              type="tel"
              autoComplete="off"
              placeholder="+7 900 123-45-67"
            />
            {error("phone")}
          </Field>
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="email">Почта</FieldLabel>
            <Input
              {...fieldProps("email")}
              type="email"
              autoComplete="off"
              placeholder="anna@example.com"
            />
            {error("email")}
          </Field>
        </div>
      </FieldGroup>
      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Сохраняю…" : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}
