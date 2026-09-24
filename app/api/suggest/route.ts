import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Suggestions while typing, from the names in our own database. Nominatim is
// not asked here: its usage policy rules out a lookup per keystroke, so it is
// only asked once a street is picked or the search is submitted.

const MAX_SUGGESTIONS = 6;

// "13 Huk", "13D Wellington", "2/17 Tudor": a house number, then the street.
const HOUSE_NUMBER = /^(\d+[a-z]?(?:\/\d+[a-z]?)?)\s+(.+)$/i;

type Row = {
  name: string;
  kind: string;
  context: string | null;
  lng: number | null;
  lat: number | null;
};

type Suggestion = {
  label: string;
  kind: string;
  context: string | null;
  // Only a place or an amenity has one; a street is resolved by Nominatim.
  point: { lng: number; lat: number } | null;
};

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();

  if (q.length < 2 || q.length > 100) {
    return NextResponse.json({ error: "Query must be 2 to 100 characters" }, { status: 400 });
  }

  // A house number only makes sense in front of a street, so with one the
  // rest is matched on its own and only streets are kept, number put back.
  const numbered = HOUSE_NUMBER.exec(q);
  const number = numbered?.[1] ?? null;
  const text = numbered?.[2] ?? q;

  try {
    const result = await pool.query(
      "SELECT walkreach_suggest($1, $2) AS suggestions",
      // Streets are a fraction of the matches for some text, so ask for more
      // when the rest will be dropped.
      [text, number ? MAX_SUGGESTIONS * 4 : MAX_SUGGESTIONS],
    );
    const rows: Row[] = result.rows[0].suggestions;

    const suggestions: Suggestion[] = rows
      .filter((r) => !number || r.kind === "street")
      .slice(0, MAX_SUGGESTIONS)
      .map((r) => ({
        label: number ? `${number} ${r.name}` : r.name,
        kind: r.kind,
        context: r.context,
        point: r.lng !== null && r.lat !== null ? { lng: r.lng, lat: r.lat } : null,
      }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }
}
