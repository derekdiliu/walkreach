import { NextResponse } from "next/server";
import { pool } from "@/app/_lib/db";

// For an uptime monitor. The app answering is not enough: every page needs
// the database, so this only says ok once a query has gone through.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ status: "error", error: "Database unreachable" }, { status: 503 });
  }
}
