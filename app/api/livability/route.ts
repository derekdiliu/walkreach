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
    const result = await pool.query("SELECT * FROM livability_score($1, $2)", [
      lng,
      lat,
    ]);

    const categories = result.rows;
    const total = categories.reduce(
      (sum, row) => sum + parseFloat(row.weighted_score),
      0,
    );

    return NextResponse.json({
      location: { lng, lat },
      total_score: Math.round(total * 10) / 10,
      breakdown: categories,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Database query failed" },
      { status: 500 },
    );
  }
}
