import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lng = parseFloat(searchParams.get("lng") || "");
  const lat = parseFloat(searchParams.get("lat") || "");

  if (isNaN(lng) || isNaN(lat)) {
    return NextResponse.json(
      { error: "Missing or invalid lng/lat parameters" },
      { status: 400 },
    );
  }

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
