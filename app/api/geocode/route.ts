import { NextRequest, NextResponse } from "next/server";

// Hamilton, matching the BBOX that sql/00-import.sh clips the network to -
// there is no point resolving an address the router cannot reach.
const VIEWBOX = "175.20,-37.85,175.32,-37.73";

// Nominatim's usage policy asks for a User-Agent that identifies the
// application and a way to reach whoever runs it. Browsers cannot set one, so
// the lookup is proxied through here rather than called from the client.
const USER_AGENT =
  "WalkReach/0.1 (COMPX576 research project; https://github.com/derekdiliu/walkreach)";

type NominatimPlace = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();

  if (q.length < 3) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      format: "jsonv2",
      q,
      countrycodes: "nz",
      viewbox: VIEWBOX,
      bounded: "1",
      limit: "5",
    });

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const places: NominatimPlace[] = await res.json();

    const seen = new Set<string>();
    const results = [];
    for (const p of places) {
      // The full display_name ends in ", Waikato, 3240, New Zealand /
      // Aotearoa" on every result, which is noise when every result is in
      // Hamilton. The first three parts are what tells them apart.
      const label = p.display_name.split(", ").slice(0, 3).join(", ");
      // A long street is several ways in OSM, so it comes back several times
      // under one label. Offering the same label twice tells the reader
      // nothing about which to pick.
      if (seen.has(label)) continue;
      seen.add(label);
      results.push({ lng: parseFloat(p.lon), lat: parseFloat(p.lat), label });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
  }
}
