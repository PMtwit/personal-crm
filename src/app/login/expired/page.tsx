import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Ссылка устарела",
};

// Where a link that does not work leads: it was already used, is older than
// 15 minutes or was cancelled by a newer one
export default function ExpiredLinkPage() {
  return (
    <div className="-mx-1 flex flex-col items-center gap-4 rounded-block bg-linear-160/srgb from-hero-from to-hero-to px-5 py-14 text-center sm:mx-0 sm:rounded-block-lg sm:py-16">
      <h1 className="text-title font-medium text-balance sm:text-title-lg">
        Ссылка устарела, запроси новую
      </h1>
      <Link
        href="/login"
        className={buttonVariants({ size: "lg", className: "mt-2" })}
      >
        Получить новую ссылку
      </Link>
    </div>
  );
}
