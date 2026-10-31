import { z } from "zod";

import { formatDueDate, overdueText } from "@/lib/format";

// How often the owner wants to talk to a contact. "none" exists only in the form:
// in the database the contact then has no interval (null)
export const touchIntervals = ["week", "month", "quarter", "year"] as const;

export type TouchInterval = (typeof touchIntervals)[number];

export const touchIntervalOptions = ["none", ...touchIntervals] as const;

export type TouchIntervalOption = (typeof touchIntervalOptions)[number];

// Interface texts: shown to the user, so they are in Russian
export const touchIntervalLabels: Record<TouchIntervalOption, string> = {
  none: "Не задано",
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};

// Value of the interval picker as it comes from the form
export const touchIntervalFormSchema = z.enum(touchIntervalOptions);

// Text of the note that opens in the "already talked" dialog
export const CONTACTED_NOTE_BODY = "Связался";

export type TouchStatusLine = {
  text: string;
  // The due date has come: shown in red
  overdue: boolean;
};

// The line under the interval picker in the contact card.
// overdueDays comes from the database: 0 or more means the due date has come,
// less than 0 means it is still ahead
export function touchStatusLine(
  dueAt: Date | null,
  overdueDays: number,
): TouchStatusLine | null {
  if (dueAt === null) {
    return null;
  }
  if (overdueDays < 0) {
    return { text: `Связаться до ${formatDueDate(dueAt)}`, overdue: false };
  }
  return { text: `Пора связаться: ${overdueText(overdueDays)}`, overdue: true };
}
