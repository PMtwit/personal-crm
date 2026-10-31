"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, RedirectType } from "next/navigation";
import { z } from "zod";

import {
  deleteContact,
  insertContact,
  insertNote,
  updateContact,
} from "@/lib/data";
import {
  contactFields,
  contactSchema,
  noteSchema,
  type ContactField,
  type ContactValues,
} from "@/lib/validation";

export type ContactFormState = {
  values?: ContactValues;
  errors?: Partial<Record<ContactField, string>>;
};

export type NoteFormState = {
  body?: string;
  error?: string;
};

const contactIdSchema = z.number().int().positive();

function readContactValues(formData: FormData): ContactValues {
  return Object.fromEntries(
    contactFields.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as ContactValues;
}

function firstErrors(error: z.ZodError): ContactFormState["errors"] {
  const { fieldErrors } = z.flattenError(error);
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      (messages as string[])[0],
    ]),
  );
}

// Every page shows data straight from the database, so after any change
// drop the router cache: the list and the card must show the new data
function refreshAllPages() {
  revalidatePath("/", "layout");
}

export async function createContactAction(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const id = await insertContact(parsed.data);
  refreshAllPages();
  redirect(`/contacts/${id}`);
}

export async function updateContactAction(
  contactId: number,
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const id = contactIdSchema.parse(contactId);
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const found = await updateContact(id, parsed.data);
  if (!found) {
    notFound();
  }
  refreshAllPages();
  redirect(`/contacts/${id}`);
}

export async function deleteContactAction(contactId: number): Promise<void> {
  const id = contactIdSchema.parse(contactId);
  const name = await deleteContact(id);
  refreshAllPages();
  // The list shows "Contact deleted" by the ?deleted= parameter. If the contact
  // was already gone (deleted in another tab), just open the list.
  // Replace, not push: the Back button must not lead to the deleted contact's card
  redirect(
    name === null ? "/" : `/?deleted=${encodeURIComponent(name)}`,
    RedirectType.replace,
  );
}

export async function addNoteAction(
  contactId: number,
  _previousState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const id = contactIdSchema.parse(contactId);
  const body = String(formData.get("body") ?? "");
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: parsed.error.issues[0].message };
  }

  const saved = await insertNote(id, parsed.data.body);
  if (!saved) {
    return { body, error: "Контакт не найден" };
  }
  refreshAllPages();
  return {};
}
