"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, RedirectType } from "next/navigation";
import { z } from "zod";

import {
  createGroupForContact,
  deleteContact,
  deleteGroup,
  insertContact,
  insertNote,
  renameGroup,
  setContactGroup,
  updateContact,
  updateTouchInterval,
} from "@/lib/data";
import { touchIntervalFormSchema } from "@/lib/keep-in-touch";
import {
  contactFields,
  contactSchema,
  groupNameSchema,
  noteSchema,
  parseId,
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
  // The note was written: a dialog that sent it can close
  saved?: boolean;
};

export type TouchIntervalFormState = {
  error?: string;
};

export type ContactGroupFormState = {
  error?: string;
};

// A form with a group's name: "New group" and "Rename"
export type GroupNameFormState = {
  name?: string;
  error?: string;
  // The group was created: a dialog that sent it can close
  saved?: boolean;
};

const contactIdSchema = z.number().int().positive();
const groupIdSchema = z.number().int().positive();

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
  return { saved: true };
}

export async function setTouchIntervalAction(
  contactId: number,
  _previousState: TouchIntervalFormState,
  formData: FormData,
): Promise<TouchIntervalFormState> {
  const id = contactIdSchema.parse(contactId);
  const parsed = touchIntervalFormSchema.safeParse(formData.get("touchInterval"));
  if (!parsed.success) {
    return { error: "Выберите один из вариантов" };
  }

  const found = await updateTouchInterval(
    id,
    parsed.data === "none" ? null : parsed.data,
  );
  if (!found) {
    return { error: "Контакт не найден" };
  }
  refreshAllPages();
  return {};
}

// One click on a group pill: the form carries only this group and whether the
// contact should be in it, so the other groups of the contact stay as they are
export async function setContactGroupAction(
  contactId: number,
  _previousState: ContactGroupFormState,
  formData: FormData,
): Promise<ContactGroupFormState> {
  const id = contactIdSchema.parse(contactId);
  const groupId = parseId(String(formData.get("groupId") ?? ""));
  const member = formData.get("member");
  if (groupId === null) {
    return { error: "Группа не найдена" };
  }
  if (member !== "true" && member !== "false") {
    return { error: "Выберите один из вариантов" };
  }

  const result = await setContactGroup(id, groupId, member === "true");
  if (result === "contact-not-found") {
    return { error: "Контакт не найден" };
  }
  // The group is gone as well, so refresh: its pill must disappear from the card
  refreshAllPages();
  return result === "group-not-found" ? { error: "Группа не найдена" } : {};
}

export async function createGroupForContactAction(
  contactId: number,
  _previousState: GroupNameFormState,
  formData: FormData,
): Promise<GroupNameFormState> {
  const id = contactIdSchema.parse(contactId);
  const name = String(formData.get("name") ?? "");
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { name, error: parsed.error.issues[0].message };
  }

  const groupId = await createGroupForContact(id, parsed.data);
  if (groupId === null) {
    return { name, error: "Контакт не найден" };
  }
  refreshAllPages();
  return { saved: true };
}

export async function renameGroupAction(
  groupId: number,
  _previousState: GroupNameFormState,
  formData: FormData,
): Promise<GroupNameFormState> {
  const id = groupIdSchema.parse(groupId);
  const name = String(formData.get("name") ?? "");
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { name, error: parsed.error.issues[0].message };
  }

  const result = await renameGroup(id, parsed.data);
  if (result === "duplicate") {
    return { name, error: "Такая группа уже есть" };
  }
  if (result === "not-found") {
    // No refresh: the message must be seen in the dialog, and a refresh would
    // remove the group's row, with the dialog in it
    return { name, error: "Группа не найдена" };
  }
  refreshAllPages();
  return { saved: true };
}

// No redirect: the "Groups" page redraws without the group. A group that is
// already gone (deleted in another tab) is not an error: the page just refreshes
export async function deleteGroupAction(groupId: number): Promise<void> {
  const id = groupIdSchema.parse(groupId);
  await deleteGroup(id);
  refreshAllPages();
}
