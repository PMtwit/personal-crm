import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

// On the server the app listens on its own port 3000 behind nginx. nginx passes
// on the address the person typed (Host without a port) and the protocol
function requestThroughNginx(path: string) {
  return new NextRequest(`http://0.0.0.0:3000${path}`, {
    headers: { host: "app.pmcrm.site", "x-forwarded-proto": "https" },
  });
}

describe("Без входа - на страницу входа", () => {
  it("за nginx ведёт на адрес сайта без внутреннего порта", () => {
    const response = proxy(requestThroughNginx("/"));

    expect(response.headers.get("location")).toBe(
      "https://app.pmcrm.site/login",
    );
  });

  it("карточка по прямой ссылке за nginx тоже ведёт на вход без порта", () => {
    const response = proxy(requestThroughNginx("/contacts/42?q=anna"));

    expect(response.headers.get("location")).toBe(
      "https://app.pmcrm.site/login",
    );
  });

  it("на компьютере остаётся тот же адрес и порт", () => {
    const request = new NextRequest("http://127.0.0.1:3000/", {
      headers: { host: "127.0.0.1:3000" },
    });

    const response = proxy(request);

    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/login",
    );
  });

  it("с cookie входа пропускает дальше", () => {
    const request = requestThroughNginx("/");
    request.cookies.set("better-auth.session_token", "token.signature");

    const response = proxy(request);

    expect(response.headers.get("location")).toBeNull();
  });
});
