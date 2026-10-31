"use client";

import { LoaderCircle, Search } from "lucide-react";
import Form from "next/form";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { homeHref } from "@/lib/groups";
import { parseId } from "@/lib/validation";

const DEBOUNCE_MS = 250;

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  // The chosen group stays in the address while searching
  const urlGroup = parseId(searchParams.get("group") ?? "");
  const [value, setValue] = useState(urlQuery);
  // Query typed by the user that the URL has not caught up with yet
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  // The search to run a moment after the user stops typing. A new object on
  // every change, so each keystroke restarts the wait; null when nothing waits
  const [scheduledSearch, setScheduledSearch] = useState<{
    query: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function search(query: string) {
    startTransition(() => {
      router.replace(homeHref({ q: query, group: urlGroup }), {
        scroll: false,
      });
    });
  }

  // Called by the timer: sees the latest group, even if it changed while waiting.
  // The search is done, so a later re-run of the effect does not repeat it
  const runScheduledSearch = useEffectEvent((query: string) => {
    setScheduledSearch(null);
    search(query);
  });

  // The wait lives in an effect, not in the input handler: when React takes the
  // box off the page and puts it back (Strict Mode does so on the first mount
  // in development), the cleanup stops the timer and the effect sets it again,
  // so a typed query is never lost
  useEffect(() => {
    if (scheduledSearch === null) {
      return;
    }
    const timer = setTimeout(
      () => runScheduledSearch(scheduledSearch.query),
      DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [scheduledSearch]);

  return (
    <Form
      action="/"
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        setScheduledSearch(null);
        search(value.trim());
      }}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle"
      />
      {/* Without JavaScript the form submits as a plain GET: the group goes along too */}
      {urlGroup !== null ? (
        <input type="hidden" name="group" value={urlGroup} />
      ) : null}
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const query = nextValue.trim();
          setValue(nextValue);
          setPendingQuery(query === urlQuery ? null : query);
          setScheduledSearch({ query });
        }}
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        autoComplete="off"
        className="rounded-button pr-11 pl-12"
      />
      {isPending ? (
        <LoaderCircle
          aria-label="Ищу…"
          className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-subtle"
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
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle"
      />
      <Input
        type="search"
        disabled
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        className="rounded-button pl-12"
      />
    </div>
  );
}
