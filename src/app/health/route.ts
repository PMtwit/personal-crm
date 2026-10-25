import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";

// Smoke check for deploys: 200 when the app is up and reaches the database
export async function GET() {
  // Check on every request, never at build time
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed: database is unreachable", error);
    return Response.json({ status: "database unreachable" }, { status: 503 });
  }
}
