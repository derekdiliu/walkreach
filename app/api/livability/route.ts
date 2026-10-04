import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/app/_lib/db";
import { LruCache, tooMany } from "@/app/_lib/limits";
import { parsePoint } from "../params";

// The analysis depends on the point only through the network vertex the
// walk starts at: every click that snaps to the same vertex gets the same
// answer. So it is cached by that vertex, which is found in a millisecond or
// two, and the traversal - up to 1.5 s - runs once per vertex. Off the
// network is one more key. An analysis is 30-50 kB as JSON and two or three
// times that in memory, so 200 of them is about 30 MB of a 1 GiB server.
//
// The cache lives as long as the process, so restart the app after
// reimporting the database.
const analyses = new LruCache<Analysis>(200);

type Analysis = {
  total_score: number;
  breakdown: unknown;
  amenities: unknown;
  isochrone: unknown;
};

export async function GET(req: NextRequest) {
  const point = parsePoint(new URL(req.url).searchParams);

  if (!point) {
    return NextResponse.json(
      { error: "Missing or invalid lng/lat parameters" },
      { status: 400 },
    );
  }
  const { lng, lat } = point;

  const limited = tooMany(req, "livability", 60);
  if (limited) return limited;

  try {
    const start = await pool.query(
      "SELECT walkreach_start($1, $2) AS node",
      [lng, lat],
    );
    const key = String(start.rows[0].node ?? "off");

    let analysis = analyses.get(key);
    if (!analysis) {
      const result = await pool.query(
        "SELECT walkreach_analysis($1, $2) AS analysis",
        [lng, lat],
      );
      analysis = result.rows[0].analysis as Analysis;
      analyses.set(key, analysis);
    }

    const { total_score, breakdown, amenities, isochrone } = analysis;

    return NextResponse.json(
      {
        location: { lng, lat },
        total_score,
        breakdown,
        amenities,
        isochrone,
      },
      // The data only changes on a reimport, so a browser revisiting a point
      // - back, a reload, a shared comparison - need not ask again for a while.
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
