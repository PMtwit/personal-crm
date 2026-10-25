import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

// As the contact card on the landing: a gray square with red initials
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
        "flex size-12 shrink-0 items-center justify-center rounded-avatar bg-muted text-avatar font-bold text-primary",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
