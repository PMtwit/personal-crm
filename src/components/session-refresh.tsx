"use client";

import { useEffect } from "react";

// Login lasts 30 days from the last visit. Pages are drawn on the server,
// where the library cannot write the cookie, so once the page is open the
// browser asks for the session itself: the library prolongs it (at most once
// an hour) and sets the new cookie. Nothing is drawn
export function SessionRefresh() {
  useEffect(() => {
    fetch("/api/auth/get-session", { credentials: "same-origin" }).catch(() => {
      // No connection: the next visit prolongs the login
    });
  }, []);
  return null;
}
