import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { NewContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">Новый контакт</h1>
      <NewContactForm />
    </div>
  );
}
