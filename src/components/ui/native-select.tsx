import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// The browser's own <select>: on a phone it opens the system picker.
// Looks like our Input: the same height, radius, background and error border.
// className goes to the wrapper, which sets the width; the rest goes to <select>
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div
      className={cn(
        "group/native-select relative w-full has-[select:disabled]:opacity-50",
        className,
      )}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        // The empty choice ("День", "Месяц") is gray, like an Input's placeholder
        className="h-12 w-full min-w-0 appearance-none rounded-note border border-transparent bg-muted py-1 pr-9 pl-4 text-base transition-colors outline-none focus-visible:border-ring focus-visible:bg-background disabled:pointer-events-none disabled:cursor-not-allowed has-[option[value='']:checked]:text-subtle aria-invalid:border-destructive aria-invalid:bg-background"
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

// Options have their own colors: otherwise they would all turn gray in the
// list while the empty choice is selected
function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-background text-foreground", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOption };
