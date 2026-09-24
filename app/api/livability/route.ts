import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { parsePoint } from "../params";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const point = parsePoint(new URL(req.url).searchParams);

  if (!point) {
    return NextResponse.json(
      { error: "Missing or invalid lng/lat parameters" },
      { status: 400 },
    );
  }
  const { lng, lat } = point;

  try {
    const result = await pool.query(
      "SELECT walkreach_analysis($1, $2) AS analysis",
      [lng, lat],
    );

    const { total_score, breakdown, amenities, isochrone } =
      result.rows[0].analysis;

    return NextResponse.json({
      location: { lng, lat },
      total_score,
      breakdown,
      amenities,
      isochrone,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Database query failed" },
      { status: 500 },
    );
  }
}
