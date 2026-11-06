import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// A quick check at the door: without the login cookie every page leads to the
// login page. It only looks whether the cookie is there, not at the database:
// the proxy runs on link prefetches too. The real check is requireUserId() on
// every page and in every action: a cookie of an ended session passes here
// but is sent to the login page there
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(loginAddress(request));
}

// Next.js wants a full address here. Behind nginx the address of the request
// carries the app's own host and port (0.0.0.0:3000), so the address is built
// anew from what nginx passes on: the host the person typed and the protocol.
// Changing only the host of the old address would keep its port 3000
function loginAddress(request: NextRequest) {
  const own = request.nextUrl;
  const host = request.headers.get("host") || own.host;
  const forwarded = request.headers.get("x-forwarded-proto");
  const protocol =
    forwarded === "http" || forwarded === "https"
      ? `${forwarded}:`
      : own.protocol;
  try {
    return new URL("/login", `${protocol}//${host}`);
  } catch {
    return new URL("/login", own);
  }
}

export const config = {
  // Open without login: the login pages, the library's own addresses (opening
  // a link, prolonging the session), the deploy's health check, the page assets
  // and the link preview picture
  matcher: [
    "/((?!login(?:/|$)|api/auth(?:/|$)|health$|_next/|favicon\\.ico$|opengraph-image).*)",
  ],
};
