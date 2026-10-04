import { NextRequest, NextResponse } from "next/server";
import { LruCache, tooMany } from "@/app/_lib/limits";

// Hamilton, matching the BBOX that sql/00-import.sh clips the network to -
// there is no point resolving an address the router cannot reach.
const VIEWBOX = "175.16,-37.86,175.37,-37.68";

// Nominatim's usage policy asks for a User-Agent that identifies the
// application and a way to reach whoever runs it. Browsers cannot set one, so
// the lookup is proxied through here rather than called from the client.
const USER_AGENT =
  "WalkReach/0.1 (COMPX576 research project; https://github.com/derekdiliu/walkreach)";

type Place = { lng: number; lat: number; label: string };

// The same policy allows one request a second across the whole application,
// and asks for results to be cached. Requests are spaced a second apart
// here, and one that would wait more than a few seconds for its turn is
// turned away instead: being blocked by Nominatim would end address search
// for everyone.
const lookups = new LruCache<Place[]>(500);
const SPACING_MS = 1000;
const MAX_WAIT_MS = 5000;
let nextSlot = 0;

async function waitForSlot(): Promise<boolean> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  if (at - now > MAX_WAIT_MS) return false;
  nextSlot = at + SPACING_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
  return true;
}

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

  const key = q.toLowerCase();
  const cached = lookups.get(key);
  if (cached) return NextResponse.json({ results: cached });

  const limited = tooMany(req, "geocode", 20);
  if (limited) return limited;

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

  if (!(await waitForSlot())) {
    return NextResponse.json({ error: "Address lookup is busy" }, { status: 503 });
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const places: NominatimPlace[] = await res.json();

    const seen = new Set<string>();
    const results: Place[] = [];
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

    lookups.set(key, results);
    return NextResponse.json({ results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
  }
}
