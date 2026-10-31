import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="-mx-1 flex flex-col items-center gap-4 rounded-block bg-linear-160/srgb from-hero-from to-hero-to px-5 py-14 text-center sm:mx-0 sm:rounded-block-lg sm:py-16">
      <h1 className="text-title font-medium text-balance sm:text-title-lg">
        Такой страницы нет
      </h1>
      <p className="text-pretty text-muted-foreground sm:text-lg">
        Возможно, в адресе опечатка или контакта с таким номером не существует
      </p>
      <Link
        href="/"
        className={buttonVariants({ size: "lg", className: "mt-2" })}
      >
        К списку контактов
      </Link>
    </div>
  );
}
