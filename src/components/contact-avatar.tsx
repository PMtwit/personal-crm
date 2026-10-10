import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function ContactAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
