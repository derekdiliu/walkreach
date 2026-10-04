import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/app/_lib/db";
import { tooMany } from "@/app/_lib/limits";
import { parseId, parsePoint } from "../params";

// The walk from a point to one of the amenities its analysis listed. Asked
// for one at a time, when someone picks an amenity, rather than returned for
// all of them with the analysis: a city-centre walk reaches 140.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const point = parsePoint(searchParams);
  const amenity = parseId(searchParams, "amenity");

  if (!point || amenity === null) {
    return NextResponse.json(
      { error: "Missing or invalid lng/lat/amenity parameters" },
      { status: 400 },
    );
  }
  const { lng, lat } = point;

  const limited = tooMany(req, "route", 120);
  if (limited) return limited;

  try {
    const result = await pool.query(
      "SELECT walkreach_route($1, $2, $3) AS route",
      [lng, lat, amenity],
    );

    const found = result.rows[0].route;
    if (!found) {
      return NextResponse.json(
        { error: "Amenity not within a 15 minute walk" },
        { status: 404 },
      );
    }

    const { amenity: reached, destination, route, connectors } = found;
    return NextResponse.json(
      { amenity: reached, destination, route, connectors },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Database query failed" },
      { status: 500 },
    );
  }
}
