import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// The card and the edit page of a contact that is not there: one that never
// existed, was deleted, or belongs to someone else. The page is the same for
// all three, so it never tells that a contact exists for another person
export default function ContactNotFound() {
  return (
    <div className="-mx-1 flex flex-col items-center gap-4 rounded-block bg-linear-160/srgb from-hero-from to-hero-to px-5 py-14 text-center sm:mx-0 sm:rounded-block-lg sm:py-16">
      <h1 className="text-title font-medium text-balance sm:text-title-lg">
        Контакт не найден
      </h1>
      <Link
        href="/"
        className={buttonVariants({ size: "lg", className: "mt-2" })}
      >
        К списку контактов
      </Link>
    </div>
  );
}
