"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { createContactAction, type ContactFormState } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { monthNamesGenitive } from "@/lib/format";
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
  birthDay: "",
  birthMonth: "",
  birthYear: "",
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
        <BirthDateField values={values} error={errors.birthDate} />
      </FieldGroup>
      {/* On a phone "Add contact" and "Cancel" are wider than the screen: the
          background-less "Cancel" gets narrower padding there, and on the
          narrowest screens it goes to the next line instead of off the edge */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Сохраняю…" : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className={buttonVariants({
            variant: "ghost",
            size: "lg",
            className: "max-sm:px-3",
          })}
        >
          Отмена
        </Link>
      </div>
    </form>
  );
}

const dayOptions = Array.from({ length: 31 }, (_, index) => String(index + 1));

// Three controls in a row: the day and the month are the browser's own lists
// (a phone opens its system picker), the year is typed and may stay empty.
// One error for the whole date, under the row
function BirthDateField({
  values,
  error,
}: {
  values: ContactValues;
  error?: string;
}) {
  const invalid = error ? true : undefined;
  const errorId = error ? "birthDate-error" : undefined;

  return (
    <Field
      role="group"
      aria-labelledby="birthDate-label"
      data-invalid={invalid}
    >
      <FieldTitle id="birthDate-label" className="leading-snug">
        Дата рождения
      </FieldTitle>
      {/* The day is narrow, the month wider, the year in between */}
      <div className="grid grid-cols-[5fr_8fr_5fr] gap-2 sm:grid-cols-[6.5rem_10rem_6.5rem]">
        <div className="min-w-0">
          <label htmlFor="birthDay" className="sr-only">
            День
          </label>
          {/* A select keeps the choice it had when it appeared, even after the
              form is reset: a new key shows what was sent after a failed save */}
          <NativeSelect
            key={values.birthDay}
            id="birthDay"
            name="birthDay"
            defaultValue={values.birthDay}
            aria-invalid={invalid}
            aria-describedby={errorId}
          >
            <NativeSelectOption value="">День</NativeSelectOption>
            {dayOptions.map((day) => (
              <NativeSelectOption key={day} value={day}>
                {day}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="min-w-0">
          <label htmlFor="birthMonth" className="sr-only">
            Месяц
          </label>
          <NativeSelect
            key={values.birthMonth}
            id="birthMonth"
            name="birthMonth"
            defaultValue={values.birthMonth}
            aria-invalid={invalid}
            aria-describedby={errorId}
          >
            <NativeSelectOption value="">Месяц</NativeSelectOption>
            {monthNamesGenitive.map((name, index) => (
              <NativeSelectOption key={name} value={String(index + 1)}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="min-w-0">
          <label htmlFor="birthYear" className="sr-only">
            Год
          </label>
          <Input
            id="birthYear"
            name="birthYear"
            defaultValue={values.birthYear}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="Год"
            aria-invalid={invalid}
            aria-describedby={
              error ? "birthDate-hint birthDate-error" : "birthDate-hint"
            }
          />
        </div>
      </div>
      <FieldDescription id="birthDate-hint">
        Год можно не указывать
      </FieldDescription>
      {error ? <FieldError id="birthDate-error">{error}</FieldError> : null}
    </Field>
  );
}
