import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-note border border-transparent bg-muted px-4 py-3 text-base transition-colors outline-none placeholder:text-subtle focus-visible:border-ring focus-visible:bg-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:bg-background",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
