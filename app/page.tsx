"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type Breakdown = {
  category: string;
  weighted_score: number;
  max_score: number;
  nearest_m: number | null;
  nearest_name: string | null;
};
type Place = { lng: number; lat: number; label: string };
type Result = {
  location: { lng: number; lat: number };
  total_score: number;
  breakdown: Breakdown[];
  isochrone: { type: string; features: any[] };
};

const EMPTY_GEOJSON = { type: "FeatureCollection" as const, features: [] };

const BANDS = [
  { minutes: 5, color: "#0d3b4f", opacity: 0.66 },
  { minutes: 10, color: "#3e93ad", opacity: 0.54 },
  { minutes: 15, color: "#a9dceb", opacity: 0.46 },
];

// A score on its own does not tell anyone whether 62 is good. Each band says
// what the number means in terms of the five essentials WalkReach actually
// measures, over the 15 minute network walk it measures them within.
const SCORE_BANDS = [
  { min: 80, label: "Everything close by",
    blurb: "All five everyday essentials are a short walk from here." },
  { min: 60, label: "Mostly walkable",
    blurb: "Most everyday essentials are within a 15 minute walk." },
  { min: 40, label: "Some essentials nearby",
    blurb: "A few essentials are close. Others mean a longer trip." },
  { min: 20, label: "Limited on foot",
    blurb: "Most everyday trips from here would need a car or a bus." },
  { min: 0, label: "Car-dependent",
    blurb: "Almost nothing is within a 15 minute walk." },
];

const scoreBand = (score: number) =>
  SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];

const CATEGORY_LABEL: Record<string, string> = {
  supermarket: "Supermarket",
  clinic: "Clinic",
  school: "School",
  park: "Park",
  bus_stop: "Bus stop",
};

const CITY_CENTRE: [number, number] = [175.2793, -37.7871];

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const analyseRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [offNetwork, setOffNetwork] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [choices, setChoices] = useState<Place[] | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  useEffect(() => {
    let map: any;
    let cancelled = false;

    (async () => {
      const { Map: MapLibreMap, Marker, setWorkerUrl } = await import(
        "maplibre-gl"
      );

      // MapLibre resolves its worker from import.meta.url, which Turbopack
      // rewrites to a chunk path where the worker file does not exist. The
      // worker then dies silently and anything parsed off the main thread
      // (GeoJSON sources) never renders. Point it at the copy in public/.
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      if (cancelled || mapRef.current || !mapContainer.current) return;

      map = new MapLibreMap({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
            isochrone: { type: "geojson", data: EMPTY_GEOJSON },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm" },
            {
              id: "isochrone-fill",
              type: "fill",
              source: "isochrone",
              paint: {
                // each band gets its own colour AND opacity, so the three
                // rings read as distinct steps rather than one wash
                "fill-color": [
                  "match",
                  ["get", "minutes"],
                  5,
                  BANDS[0].color,
                  10,
                  BANDS[1].color,
                  15,
                  BANDS[2].color,
                  "#cccccc",
                ],
                "fill-opacity": [
                  "match",
                  ["get", "minutes"],
                  5,
                  BANDS[0].opacity,
                  10,
                  BANDS[1].opacity,
                  15,
                  BANDS[2].opacity,
                  0.4,
                ],
              },
            },
            {
              id: "isochrone-outline",
              type: "line",
              source: "isochrone",
              paint: {
                "line-color": "#ffffff",
                "line-width": 1.5,
                "line-opacity": 0.9,
              },
            },
          ],
        },
        center: CITY_CENTRE,
        zoom: 13,
      });

      mapRef.current = map;

      // A click can still land before the style has finished parsing, so hold
      // the data until the source is there rather than dropping it.
      const setIsochrone = (data: any) => {
        const source = map.getSource("isochrone");
        if (source) source.setData(data);
        else map.once("styledata", () => map.getSource("isochrone").setData(data));
      };

      const analyse = async (lng: number, lat: number) => {
        setShowWelcome(false);
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = new Marker().setLngLat([lng, lat]).addTo(map);

        setLoading(true);
        setResult(null);
        setOffNetwork(false);
        setIsochrone(EMPTY_GEOJSON);

        try {
          const res = await fetch(`/api/livability?lng=${lng}&lat=${lat}`);
          const data: Result = await res.json();

          setResult(data);
          setOffNetwork(data.isochrone.features.length === 0);
          setIsochrone(data.isochrone);
        } catch {
          setResult(null);
        }
        setLoading(false);
      };

      analyseRef.current = analyse;
      map.on("click", (e: any) => analyse(e.lngLat.lng, e.lngLat.lat));
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      analyseRef.current = null;
    };
  }, []);

  const goTo = (lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15 });
    analyseRef.current?.(lng, lat);
  };

  const tryCityCentre = () => {
    mapRef.current?.flyTo({ center: CITY_CENTRE, zoom: 14 });
    analyseRef.current?.(CITY_CENTRE[0], CITY_CENTRE[1]);
  };

  // Submit-only, no lookup per keystroke: Nominatim's usage policy rules out
  // autocomplete, and the answer is worth a deliberate press anyway.
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;

    setSearching(true);
    setChoices(null);
    setSearchNote(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const { results } = (await res.json()) as { results?: Place[] };

      if (!results || results.length === 0) {
        setSearchNote(
          "No match in Hamilton. Try a street name, or click the map.",
        );
      } else if (results.length === 1) {
        goTo(results[0].lng, results[0].lat);
      } else {
        // A street runs for kilometres and scores differently along it, so
        // picking the top hit silently would be picking one end of it.
        setChoices(results);
      }
    } catch {
      setSearchNote("Address lookup is unavailable. Click the map instead.");
    }
    setSearching(false);
  };

  const choose = (place: Place) => {
    setChoices(null);
    setQuery(place.label);
    goTo(place.lng, place.lat);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapContainer} style={{ height: "100%" }} />
        {showWelcome && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 30, 35, 0.42)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              // let clicks fall through to the map: the card says to click it
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",
                background: "#ffffff",
                color: "#1a1a1a",
                borderRadius: 12,
                padding: "32px 34px",
                maxWidth: 460,
                boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
                lineHeight: 1.55,
              }}
            >
              <h2 style={{ fontSize: 26, marginBottom: 8 }}>WalkReach</h2>
              <p style={{ fontSize: 17, marginBottom: 14 }}>
                Find out how walkable any address in Hamilton really is.
              </p>
              <p style={{ color: "#555", marginBottom: 20 }}>
                Distances are measured along real streets and footpaths, not
                straight lines — so the Waikato River and every other barrier
                counts, the way it does when you actually walk.
              </p>

              <ol
                style={{
                  margin: "0 0 24px 0",
                  paddingLeft: 20,
                  color: "#444",
                  fontSize: 14,
                }}
              >
                <li style={{ marginBottom: 6 }}>
                  Search an address, or click anywhere on the map — a
                  street, a suburb, a place you are thinking of renting.
                </li>
                <li style={{ marginBottom: 6 }}>
                  See how far you can walk from there in 5, 10 and 15 minutes.
                </li>
                <li>
                  Get a walkability score and how far the nearest supermarket,
                  clinic, school, park and bus stop are on foot.
                </li>
              </ol>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={tryCityCentre}
                  style={{
                    background: "#2c5f6f",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "11px 18px",
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Show me an example
                </button>
                <button
                  onClick={() => setShowWelcome(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#2c5f6f",
                    padding: "11px 6px",
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Pick a spot myself
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <aside
        style={{
          width: 380,
          flexShrink: 0,
          padding: "28px 24px",
          overflowY: "auto",
          background: "#ffffff",
          color: "#1a1a1a",
          borderLeft: "1px solid #e2e2e2",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 2 }}>WalkReach</h1>
        <p style={{ color: "#666", marginBottom: 14 }}>
          Walking accessibility in Hamilton, NZ
        </p>

        <form onSubmit={search} style={{ display: "flex", gap: 6 }}>
          <input
            id="address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street, suburb or place"
            aria-label="Search for an address in Hamilton"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "8px 10px",
              fontSize: 14,
              fontFamily: "inherit",
              color: "inherit",
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#fff",
            }}
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 3}
            style={{
              flexShrink: 0,
              background: "#2c5f6f",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 14,
              fontFamily: "inherit",
              cursor: "pointer",
              opacity: searching || query.trim().length < 3 ? 0.45 : 1,
            }}
          >
            {searching ? "…" : "Search"}
          </button>
        </form>

        {searchNote && (
          <p style={{ color: "#666", fontSize: 13, marginTop: 8 }}>
            {searchNote}
          </p>
        )}

        {choices && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 4 }}>
              Which one?
            </div>
            {choices.map((c) => (
              <button
                key={c.label}
                onClick={() => choose(c)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid #eee",
                  padding: "7px 0",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                  color: "#2c5f6f",
                  cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ height: 20 }} />

        {!result && !loading && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>
              How much of everyday life is within a short walk?
            </p>
            <p style={{ marginBottom: 10 }}>
              Search an address above, or click any point on the map.
              WalkReach traces how far you can actually walk from there in 5,
              10 and 15 minutes, then scores how close the nearest supermarket,
              clinic, school, park and bus stop are.
            </p>
            <p style={{ color: "#666", marginBottom: 18 }}>
              Distances follow the real street and footpath network, not
              straight lines — so the Waikato River and other barriers count.
            </p>
            <button
              onClick={tryCityCentre}
              style={{
                background: "#2c5f6f",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Try the city centre
            </button>
          </div>
        )}

        {loading && <p style={{ color: "#666" }}>Calculating…</p>}

        {offNetwork && (
          <p style={{ color: "#a33" }}>
            This location is outside the Hamilton walking network, so no
            catchment could be computed. Try a point inside the city.
          </p>
        )}

        {result && !offNetwork && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  border: "1px solid #cfdde2",
                  borderRadius: 6,
                  background: "#f2f8fa",
                  padding: "5px 10px 7px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#6b8a94",
                  }}
                >
                  out of 100
                </div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: "bold",
                    color: "#2c5f6f",
                    lineHeight: 1.1,
                  }}
                >
                  {result.total_score}
                </div>
              </div>
              <div style={{ paddingTop: 2 }}>
                <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.25 }}>
                  {scoreBand(result.total_score).label}
                </div>
                <div style={{ color: "#666", marginTop: 3 }}>
                  {scoreBand(result.total_score).blurb}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "#888",
                marginTop: 22,
                marginBottom: 4,
              }}
            >
              Nearest of each
            </div>

            {result.breakdown.map((b) => (
              <div
                key={b.category}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "9px 0",
                  borderTop: "1px solid #eee",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {CATEGORY_LABEL[b.category] ?? b.category}
                  </div>
                  {b.nearest_m === null ? (
                    <div style={{ color: "#666", fontSize: 13 }}>
                      None within a 15 minute walk
                    </div>
                  ) : (
                    // The distance is the measurement and the name is context,
                    // so a long name truncates rather than pushing the metres
                    // onto a line of their own.
                    <div
                      style={{
                        display: "flex",
                        gap: 5,
                        color: "#666",
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.nearest_name ??
                          `Unnamed ${(
                            CATEGORY_LABEL[b.category] ?? b.category
                          ).toLowerCase()}`}
                      </span>
                      <span style={{ flexShrink: 0 }}>
                        · {b.nearest_m} m walk
                      </span>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    fontWeight: 500,
                    color: b.nearest_m === null ? "#aaa" : "#1a1a1a",
                  }}
                >
                  {b.weighted_score}
                  <span style={{ color: "#aaa", fontWeight: 400 }}>
                    {" "}
                    / {b.max_score}
                  </span>
                </div>
              </div>
            ))}

            <p style={{ color: "#888", fontSize: 12.5, marginTop: 14 }}>
              Each category scores by how close its nearest one is on foot, up
              to its own maximum. Distances follow the street network.
            </p>
          </div>
        )}

        <div style={{ marginTop: 26, fontSize: 13, color: "#666" }}>
          <div style={{ marginBottom: 6 }}>Walking time from the pin</div>
          {BANDS.map((band) => (
            <div
              key={band.minutes}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "2px 0",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  background: band.color,
                  opacity: band.opacity,
                  border: "1px solid #fff",
                  outline: "1px solid #ddd",
                }}
              />
              {band.minutes} minutes
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
