import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

// Who is logged in, or null. One database query per page, however many
// blocks of the page ask: the answer is kept for the time of the request
export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

// The id of the logged-in user for pages and actions. Without a session
// the person goes to the login page. This is where every page and action
// gets the user from: never from the address or a form
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user.id;
}
