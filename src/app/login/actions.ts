"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requestSignInLink } from "@/lib/sign-in";

export type SignInFormState = {
  // What the field holds: what the person typed, or the cleaned address
  email?: string;
  // The letter was sent to this address
  sentTo?: string;
  error?: string;
};

const errorTexts = {
  "invalid-email": "Проверь адрес почты",
  "rate-limited": "Слишком часто, попробуй через несколько минут",
  "send-failed": "Не получилось отправить письмо, попробуй ещё раз",
} as const;

// The login form. All the rules (the email check, the limit of letters) are in
// requestSignInLink: this action only passes the form there and shows the answer
export async function requestSignInLinkAction(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const email = String(formData.get("email") ?? "");
  const result = await requestSignInLink(email, await headers());
  if ("sentTo" in result) {
    return { email: result.sentTo, sentTo: result.sentTo };
  }
  return { email, error: errorTexts[result.error] };
}

// "Выйти": ends the login on this device only; other devices stay logged in
export async function signOutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
