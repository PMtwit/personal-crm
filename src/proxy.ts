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
  // Next.js wants a full address here. Behind nginx the address of the request
  // can carry the server's own host (0.0.0.0), so the host and the protocol
  // are taken from what nginx passes on: the address the person typed
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const host = request.headers.get("host");
  if (host) {
    login.host = host;
  }
  const protocol = request.headers.get("x-forwarded-proto");
  if (protocol === "http" || protocol === "https") {
    login.protocol = protocol;
  }
  return NextResponse.redirect(login);
}

export const config = {
  // Open without login: the login pages, the library's own addresses (opening
  // a link, prolonging the session), the deploy's health check, the page assets
  // and the link preview picture
  matcher: [
    "/((?!login(?:/|$)|api/auth(?:/|$)|health$|_next/|favicon\\.ico$|opengraph-image).*)",
  ],
};
