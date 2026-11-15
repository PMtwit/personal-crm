"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

// How many rows are shown before "Show all"
const VISIBLE_COUNT = 5;

// The list of a home page block ("Time to get in touch", "Birthday soon"):
// the first five rows on a white card and, if there are more, a button that
// shows all of them and folds them back
export function ExpandableList<Item extends { id: number }>({
  items,
  label,
  renderItem,
}: {
  items: Item[];
  // What the list is, for screen readers
  label: string;
  renderItem: (item: Item) => ReactNode;
}) {
  // Kept in the component: after going to another page and back the block is folded again
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > VISIBLE_COUNT;
  const visible = expanded ? items : items.slice(0, VISIBLE_COUNT);

  return (
    <>
      <ul
        aria-label={label}
        className="flex flex-col gap-0.5 rounded-card bg-card p-1 shadow-card sm:rounded-card-lg sm:p-1.5 sm:shadow-card-lg"
      >
        {visible.map((item) => (
          <li key={item.id}>{renderItem(item)}</li>
        ))}
      </ul>
      {hasMore ? (
        <Button
          variant="outline"
          onClick={() => setExpanded(!expanded)}
          className="w-full sm:ml-1 sm:w-fit sm:self-start"
        >
          {expanded ? "Свернуть" : `Показать всех (${items.length})`}
        </Button>
      ) : null}
    </>
  );
}
