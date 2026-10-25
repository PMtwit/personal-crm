"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="-mx-1 flex flex-col items-center gap-4 rounded-block bg-linear-160/srgb from-hero-from to-hero-to px-5 py-14 text-center sm:mx-0 sm:rounded-block-lg sm:py-16">
      <h1 className="text-title font-medium text-balance sm:text-title-lg">
        Не получилось загрузить данные
      </h1>
      <p className="max-w-lg text-pretty text-muted-foreground sm:text-lg">
        Скорее всего, это временный сбой. Подождите минуту и попробуйте
        ещё раз.
      </p>
      <Button size="lg" className="mt-2" onClick={() => retry()}>
        Попробовать ещё раз
      </Button>
    </div>
  );
}
