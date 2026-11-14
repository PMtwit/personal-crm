import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { installSafeQueryErrors } from "./safe-query-errors";
import * as schema from "./schema";

installSafeQueryErrors();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
  );
}

// Reuse one pool across hot reloads in development
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // A query waits for a free connection (or for the database to answer the
    // first connect) no longer than 10 seconds, then fails. Without it, when
    // every connection is taken, all later queries would wait forever and the
    // app would not come back by itself
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle({ client: pool, schema });
