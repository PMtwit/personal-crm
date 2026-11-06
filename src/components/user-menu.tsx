import { signOutAction } from "@/app/login/actions";
import { SessionRefresh } from "@/components/session-refresh";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// The right side of the header: the email of the person and "Выйти".
// Nothing without a login
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* A long email is cut with "…" on a phone; the full one is in the tooltip */}
      <span
        title={user.email}
        className="min-w-0 truncate text-sm text-muted-foreground sm:text-base"
      >
        {user.email}
      </span>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm">
          Выйти
        </Button>
      </form>
      <SessionRefresh />
    </div>
  );
}
