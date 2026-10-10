import { loadEnvConfig } from "@next/env";

// Tests use their own database next to the main one ("<name>_test"),
// so they never touch real contacts
export function testDatabaseUrl(): string {
  loadEnvConfig(process.cwd());
  const mainUrl = process.env.DATABASE_URL;
  if (!mainUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const url = new URL(mainUrl);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}
