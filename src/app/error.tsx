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
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Не получилось загрузить данные
      </h1>
      <p className="max-w-md text-muted-foreground">
        Скорее всего, не запущена база данных. Откройте Docker Desktop и
        выполните в папке проекта команду{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          docker compose up -d --wait
        </code>
        , затем попробуйте ещё раз.
      </p>
      <Button variant="outline" onClick={() => retry()}>
        Попробовать ещё раз
      </Button>
    </div>
  );
}
