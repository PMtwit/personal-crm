"use client";

import { CircleCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const VISIBLE_MS = 5000;

// After a contact is deleted the list opens with ?deleted=<name>.
// The name is shown for a few seconds and dropped from the address right away,
// so reloading the page does not show the message again
export function DeletedNotice() {
  const router = useRouter();
  const deleted = useSearchParams().get("deleted");
  const [name, setName] = useState<string | null>(null);

  if (deleted !== null && deleted !== name) {
    setName(deleted);
  }

  useEffect(() => {
    if (deleted !== null) {
      router.replace("/", { scroll: false });
    }
  }, [deleted, router]);

  useEffect(() => {
    if (name === null) {
      return;
    }
    const timer = setTimeout(() => setName(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  // The live region stays in the page, so screen readers announce the message;
  // "contents" keeps it from adding an empty gap while there is no message
  return (
    <div role="status" className="contents">
      {name !== null ? (
        <p className="flex items-center gap-2.5 rounded-note bg-muted px-4 py-3 animate-in fade-in-0 slide-in-from-top-1 sm:rounded-note-lg">
          <CircleCheck
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 break-words">Контакт «{name}» удалён</span>
        </p>
      ) : null}
    </div>
  );
}
