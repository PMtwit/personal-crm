// The request that server code sees in tests: what next/headers would give
// inside a real Next.js request. Tests set it with signInAs (see helpers.ts);
// setup.ts resets it before every test, so by default nobody is logged in

let currentHeaders = new Headers();

export function setRequestHeaders(headers: Headers) {
  currentHeaders = headers;
}

export function resetRequestHeaders() {
  currentHeaders = new Headers();
}

export async function requestHeaders(): Promise<Headers> {
  return currentHeaders;
}

// Cookies the server code writes (login, logout) are not kept: the tests that
// need them look at the database
export async function requestCookies() {
  return {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  };
}
