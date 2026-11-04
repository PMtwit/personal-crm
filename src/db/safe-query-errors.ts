import { PgPreparedQuery } from "drizzle-orm/pg-core";

// What is safe to keep from the driver's error: codes and the names of database
// objects. Its text and "detail" are not: Postgres quotes values there
const SAFE_FIELDS = ["code", "table", "column", "constraint"] as const;

function safeQueryError(query: string, failure: unknown): Error {
  const source = failure as Record<string, unknown>;
  const fields = Object.fromEntries(
    SAFE_FIELDS.flatMap((field) =>
      typeof source[field] === "string" ? [[field, source[field]]] : [],
    ),
  );
  const reason = Object.entries(fields)
    .map(([field, value]) => `${field}: ${value}`)
    .join(", ");
  // The query's text has only placeholders ($1, $2): the values travel apart
  return Object.assign(new Error(`Failed query: ${query}\n${reason}`), fields);
}

type QueryWithCache = (
  queryString: string,
  params: unknown[],
  query: () => Promise<unknown>,
) => Promise<unknown>;

// Drizzle reports a failed query with the values it sent ("params: Anna,+7...")
// and with the driver's error in "cause". Next.js prints an uncaught error to
// the log, and what the owner wrote about people must not get there. All queries
// pass through this one method, so a new query is covered without extra code.
// The method is internal to Drizzle: safe-query-errors.test.ts turns red if an
// update of the library renames it
export function installSafeQueryErrors(): void {
  const prepared = PgPreparedQuery.prototype as unknown as {
    queryWithCache: QueryWithCache;
  };
  const original = prepared.queryWithCache;
  prepared.queryWithCache = async function (
    this: unknown,
    queryString,
    params,
    query,
  ) {
    try {
      return await original.call(this, queryString, params, query);
    } catch (error) {
      const { cause } = error as { cause?: unknown };
      throw safeQueryError(queryString, cause ?? error);
    }
  };
}
