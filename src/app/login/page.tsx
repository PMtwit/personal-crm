import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginGate />
    </Suspense>
  );
}

// Someone who is already logged in does not need this page: the list of contacts
async function LoginGate() {
  if (await getCurrentUser()) {
    redirect("/");
  }
  return (
    <div className="-mx-1 flex flex-col items-center rounded-block bg-linear-160/srgb from-hero-from to-hero-to px-5 py-14 sm:mx-0 sm:rounded-block-lg sm:py-16">
      <SignInForm />
    </div>
  );
}
