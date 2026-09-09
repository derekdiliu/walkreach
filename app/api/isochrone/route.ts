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
      "SELECT minutes, geojson FROM get_isochrone($1, $2) ORDER BY minutes DESC",
      [lng, lat],
    );

    const features = result.rows
      .filter((row) => row.geojson)
      .map((row) => ({
        type: "Feature",
        properties: { minutes: row.minutes },
        geometry: JSON.parse(row.geojson),
      }));

    return NextResponse.json({
      type: "FeatureCollection",
      features,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Database query failed" },
      { status: 500 },
    );
  }
}
