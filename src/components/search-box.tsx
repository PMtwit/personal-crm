"use client";

import { LoaderCircle, Search } from "lucide-react";
import Form from "next/form";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 250;

export function SearchBox() {
  const router = useRouter();
  const urlQuery = useSearchParams().get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  // Query typed by the user that the URL has not caught up with yet
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // When the URL changes by itself (e.g. a link to the full list),
  // show its query in the box, unless the user is still typing
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    if (pendingQuery === null || pendingQuery === urlQuery) {
      setPendingQuery(null);
      if (urlQuery !== value.trim()) {
        setValue(urlQuery);
      }
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(query: string) {
    startTransition(() => {
      router.replace(query ? `/?q=${encodeURIComponent(query)}` : "/", {
        scroll: false,
      });
    });
  }

  return (
    <Form
      action="/"
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        search(value.trim());
      }}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const query = nextValue.trim();
          setValue(nextValue);
          setPendingQuery(query === urlQuery ? null : query);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => search(query), DEBOUNCE_MS);
        }}
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        autoComplete="off"
        className="h-10 pr-9 pl-9 text-base md:text-base"
      />
      {isPending ? (
        <LoaderCircle
          aria-label="Ищу…"
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : null}
    </Form>
  );
}

export function SearchBoxFallback() {
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        disabled
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        className="h-10 pl-9 text-base md:text-base"
      />
    </div>
  );
}
