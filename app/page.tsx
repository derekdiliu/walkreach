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
type LngLat = { lng: number; lat: number };
type SlotKey = "a" | "b";
type Slot = {
  // label is null for a point clicked on the map rather than searched for
  point: (LngLat & { label: string | null }) | null;
  result: Result | null;
  loading: boolean;
};

const EMPTY_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_SLOT: Slot = { point: null, result: null, loading: false };

const BANDS = [
  { minutes: 5, color: "#0d3b4f", opacity: 0.66 },
  { minutes: 10, color: "#3e93ad", opacity: 0.54 },
  { minutes: 15, color: "#a9dceb", opacity: 0.46 },
];

const SLOT_COLOR: Record<SlotKey, string> = { a: "#1f78b4", b: "#e8710a" };
const COMPARE_OPACITY = 0.38;

const isOffNetwork = (result: Result) => result.isochrone.features.length === 0;

const formatPoint = (p: LngLat) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

const parsePoint = (value: string | null): LngLat | null => {
  const [lng, lat] = (value ?? "").split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
};

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
  const markerClassRef = useRef<any>(null);
  const markersRef = useRef<Record<SlotKey, any>>({ a: null, b: null });
  // Bumped each time a slot is re-placed or cleared, so a response for a point
  // that is no longer there is dropped rather than drawn over its replacement.
  const requestRef = useRef<Record<SlotKey, number>>({ a: 0, b: 0 });
  const clickRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [slots, setSlots] = useState<Record<SlotKey, Slot>>({
    a: EMPTY_SLOT,
    b: EMPTY_SLOT,
  });
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState<SlotKey>("a");
  const [showWelcome, setShowWelcome] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [choices, setChoices] = useState<Place[] | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  const { result, loading } = slots.a;
  const offNetwork = !!result && isOffNetwork(result);

  const updateSlot = (key: SlotKey, patch: Partial<Slot>) =>
    setSlots((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  // A click can still land before the style has finished parsing, so hold
  // the data until the source is there rather than dropping it.
  const setIsochrone = (key: SlotKey, data: any) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(`isochrone-${key}`);
    if (source) source.setData(data);
    else
      map.once("styledata", () =>
        map.getSource(`isochrone-${key}`).setData(data),
      );
  };

  const putMarker = (key: SlotKey, lng: number, lat: number, coloured: boolean) => {
    markersRef.current[key]?.remove();
    markersRef.current[key] = new markerClassRef.current(
      coloured ? { color: SLOT_COLOR[key] } : {},
    )
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
  };

  const analyse = async (
    key: SlotKey,
    lng: number,
    lat: number,
    label: string | null,
    coloured: boolean,
  ) => {
    setShowWelcome(false);
    putMarker(key, lng, lat, coloured);
    const request = ++requestRef.current[key];

    updateSlot(key, { point: { lng, lat, label }, result: null, loading: true });
    setIsochrone(key, EMPTY_GEOJSON);

    let data: Result | null;
    try {
      const res = await fetch(`/api/livability?lng=${lng}&lat=${lat}`);
      data = res.ok ? await res.json() : null;
    } catch {
      data = null;
    }

    if (request !== requestRef.current[key]) return;
    updateSlot(key, { result: data, loading: false });
    if (data) setIsochrone(key, data.isochrone);
  };

  // Frame both walks, not just both pins: each can reach 1,250 m out, which
  // at Hamilton's latitude is about 0.0112 degrees of latitude and 0.0142 of
  // longitude.
  const fitBoth = (p: LngLat, q: LngLat) =>
    mapRef.current?.fitBounds(
      [
        [Math.min(p.lng, q.lng) - 0.0142, Math.min(p.lat, q.lat) - 0.0112],
        [Math.max(p.lng, q.lng) + 0.0142, Math.max(p.lat, q.lat) + 0.0112],
      ],
      { padding: 24 },
    );

  useEffect(() => {
    let map: any;
    let cancelled = false;

    // Read the shared points now: once a point is placed, the effect that
    // mirrors state into the address bar rewrites the query string.
    const params = new URLSearchParams(window.location.search);
    const sharedA = parsePoint(params.get("a"));
    const sharedB = parsePoint(params.get("b"));

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
            "isochrone-a": { type: "geojson", data: EMPTY_GEOJSON },
            "isochrone-b": { type: "geojson", data: EMPTY_GEOJSON },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm" },
            {
              id: "isochrone-fill",
              type: "fill",
              source: "isochrone-a",
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
              source: "isochrone-a",
              paint: {
                "line-color": "#ffffff",
                "line-width": 1.5,
                "line-opacity": 0.9,
              },
            },
            // Comparing, each place fills its whole 15 minute walk in one
            // colour. The bands are separate rings, so filling all three
            // gives the full area; two sets of three shades on one map
            // could not be told apart.
            {
              id: "compare-a-fill",
              type: "fill",
              source: "isochrone-a",
              layout: { visibility: "none" },
              paint: {
                "fill-color": SLOT_COLOR.a,
                "fill-opacity": COMPARE_OPACITY,
              },
            },
            {
              id: "compare-b-fill",
              type: "fill",
              source: "isochrone-b",
              layout: { visibility: "none" },
              paint: {
                "fill-color": SLOT_COLOR.b,
                "fill-opacity": COMPARE_OPACITY,
              },
            },
          ],
        },
        center: CITY_CENTRE,
        zoom: 13,
      });

      mapRef.current = map;
      markerClassRef.current = Marker;
      setMapReady(true);
      map.on("click", (e: any) => clickRef.current?.(e.lngLat.lng, e.lngLat.lat));

      // A shared link opens on what was shared, not on the welcome card.
      if (sharedA && sharedB) {
        setCompare(true);
        setActive("b");
        analyse("a", sharedA.lng, sharedA.lat, null, true);
        analyse("b", sharedB.lng, sharedB.lat, null, true);
        fitBoth(sharedA, sharedB);
      } else if (sharedA) {
        analyse("a", sharedA.lng, sharedA.lat, null, false);
        map.jumpTo({ center: [sharedA.lng, sharedA.lat], zoom: 15 });
      }
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      markersRef.current = { a: null, b: null };
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const apply = () => {
      for (const id of ["isochrone-fill", "isochrone-outline"])
        map.setLayoutProperty(id, "visibility", compare ? "none" : "visible");
      for (const id of ["compare-a-fill", "compare-b-fill"])
        map.setLayoutProperty(id, "visibility", compare ? "visible" : "none");
    };
    // Not isStyleLoaded(): it stays false while any tile is still loading,
    // and "load" has long since fired by then, so the switch would never
    // apply. The layers existing is all setLayoutProperty needs.
    if (map.getLayer("compare-a-fill")) apply();
    else map.once("styledata", apply);
  }, [compare, mapReady]);

  // Mirror the placed points into the address bar, so copying the URL shares
  // exactly what is on screen.
  useEffect(() => {
    const a = slots.a.point;
    const b = slots.b.point;
    if (!a) return;
    const qs = `?a=${formatPoint(a)}` + (b ? `&b=${formatPoint(b)}` : "");
    window.history.replaceState(null, "", qs);
  }, [slots.a.point, slots.b.point]);

  const setPoint = (lng: number, lat: number, label: string | null) => {
    analyse(active, lng, lat, label, compare);
    // B is almost always what comes after A, so move on to it.
    if (compare && active === "a" && !slots.b.point) setActive("b");
  };

  // The map's click handler is bound once, so point it at the latest state.
  useEffect(() => {
    clickRef.current = (lng, lat) => setPoint(lng, lat, null);
  });

  const setMode = (on: boolean) => {
    if (on === compare) return;
    const a = slots.a.point;
    if (a) putMarker("a", a.lng, a.lat, on);
    if (!on) {
      requestRef.current.b++;
      markersRef.current.b?.remove();
      markersRef.current.b = null;
      setIsochrone("b", EMPTY_GEOJSON);
      updateSlot("b", EMPTY_SLOT);
    }
    setCompare(on);
    setActive(on && a ? "b" : "a");
    setChoices(null);
    setSearchNote(null);
  };

  const goTo = (place: Place) => {
    const other = slots[active === "a" ? "b" : "a"].point;
    if (compare && other) fitBoth(place, other);
    else mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 });
    setPoint(place.lng, place.lat, place.label);
  };

  const tryCityCentre = () => {
    mapRef.current?.flyTo({ center: CITY_CENTRE, zoom: 14 });
    setPoint(CITY_CENTRE[0], CITY_CENTRE[1], null);
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
        goTo(results[0]);
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
    goTo(place);
  };

  return (
    <div className="layout">
      <div className="map-pane">
        <div ref={mapContainer} />
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
              className="welcome-card"
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
      <aside className="panel">
        <div
          role="group"
          aria-label="Mode"
          style={{
            display: "flex",
            border: "1px solid #2c5f6f",
            borderRadius: 6,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {[false, true].map((on) => (
            <button
              key={String(on)}
              onClick={() => setMode(on)}
              aria-pressed={compare === on}
              style={{
                flex: 1,
                padding: "7px 0",
                border: "none",
                background: compare === on ? "#2c5f6f" : "#fff",
                color: compare === on ? "#fff" : "#2c5f6f",
                fontSize: 13.5,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {on ? "Compare two places" : "One place"}
            </button>
          ))}
        </div>

        {compare && (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              {(["a", "b"] as const).map((key) => {
                const point = slots[key].point;
                return (
                  <button
                    key={key}
                    onClick={() => setActive(key)}
                    aria-pressed={active === key}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "6px 8px",
                      border: `2px solid ${active === key ? SLOT_COLOR[key] : "#e2e2e2"}`,
                      borderRadius: 6,
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "inherit",
                      color: point ? "#1a1a1a" : "#888",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <SlotBadge slotKey={key} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {point ? (point.label ?? "Pin on the map") : "Not set"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p style={{ color: "#666", fontSize: 13, margin: "6px 0 10px" }}>
              Click the map or search to place {active.toUpperCase()}.
            </p>
          </>
        )}

        <form onSubmit={search} style={{ display: "flex", gap: 6 }}>
          <input
            id="address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              compare
                ? `Search for place ${active.toUpperCase()}`
                : "Street, suburb or place"
            }
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

        {!compare && !result && !loading && (
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

        {!compare && loading && (
          <p style={{ color: "#666" }}>Calculating…</p>
        )}

        {!compare && offNetwork && (
          <p style={{ color: "#a33" }}>
            This location is outside the Hamilton walking network, so no
            catchment could be computed. Try a point inside the city.
          </p>
        )}

        {!compare && result && !offNetwork && (
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

        {compare && <CompareResults a={slots.a} b={slots.b} />}

        <div style={{ marginTop: 26, fontSize: 13, color: "#666" }}>
          {compare ? (
            <>
              <div style={{ marginBottom: 6 }}>15 minute walk from each place</div>
              {(["a", "b"] as const).map((key) => (
                <div
                  key={key}
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
                      background: SLOT_COLOR[key],
                      opacity: COMPARE_OPACITY,
                      border: "1px solid #fff",
                      outline: "1px solid #ddd",
                    }}
                  />
                  Place {key.toUpperCase()}
                </div>
              ))}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function SlotBadge({ slotKey }: { slotKey: SlotKey }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: SLOT_COLOR[slotKey],
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {slotKey.toUpperCase()}
    </span>
  );
}

function CompareResults({ a, b }: { a: Slot; b: Slot }) {
  const usable = (slot: Slot) =>
    slot.result && !isOffNetwork(slot.result) ? slot.result : null;
  const results = { a: usable(a), b: usable(b) };
  const categories = (results.a ?? results.b)?.breakdown.map((r) => r.category);

  const summary = (key: SlotKey, slot: Slot) => {
    const r = results[key];
    return (
      <div
        style={{
          minWidth: 0,
          borderTop: `3px solid ${SLOT_COLOR[key]}`,
          paddingTop: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#555",
            marginBottom: 4,
          }}
        >
          <SlotBadge slotKey={key} />
          Place {key.toUpperCase()}
        </div>
        {!slot.point ? (
          <div style={{ color: "#888" }}>Not set yet</div>
        ) : slot.loading ? (
          <div style={{ color: "#666" }}>Calculating…</div>
        ) : !slot.result ? (
          <div style={{ color: "#a33" }}>Could not score this point.</div>
        ) : !r ? (
          <div style={{ color: "#a33" }}>Outside the walking network.</div>
        ) : (
          <>
            <div
              style={{
                fontSize: 28,
                fontWeight: "bold",
                color: "#2c5f6f",
                lineHeight: 1.1,
              }}
            >
              {r.total_score}
              <span style={{ fontSize: 13, fontWeight: 400, color: "#999" }}>
                {" "}
                / 100
              </span>
            </div>
            <div style={{ fontWeight: 600, lineHeight: 1.3, marginTop: 3 }}>
              {scoreBand(r.total_score).label}
            </div>
          </>
        )}
      </div>
    );
  };

  // Bold marks the closer of the two, so it is only drawn when both places
  // have an answer for that category to be closer than.
  const cell = (row?: Breakdown, other?: Breakdown) => {
    if (!row) return <div style={{ color: "#bbb" }}>—</div>;
    const closer =
      !!other &&
      row.nearest_m !== null &&
      (other.nearest_m === null || row.nearest_m < other.nearest_m);
    return (
      <div style={{ minWidth: 0 }} title={row.nearest_name ?? undefined}>
        <div
          style={{
            fontWeight: closer ? 700 : 400,
            color: row.nearest_m === null ? "#999" : "#1a1a1a",
          }}
        >
          {row.nearest_m === null ? "None" : `${row.nearest_m} m`}
        </div>
        <div
          style={{
            color: "#888",
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.nearest_m === null
            ? "within 15 min"
            : (row.nearest_name ?? "Unnamed")}
        </div>
      </div>
    );
  };

  const gap =
    results.a && results.b
      ? Math.round((results.a.total_score - results.b.total_score) * 10) / 10
      : null;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {summary("a", a)}
        {summary("b", b)}
      </div>

      {gap !== null && (
        <p style={{ color: "#666", marginTop: 10 }}>
          {gap === 0
            ? "Both places score the same."
            : `Place ${gap > 0 ? "A" : "B"} scores ${Math.abs(gap)} higher.`}
        </p>
      )}

      {categories && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 96px 96px",
              gap: 10,
              alignItems: "center",
              marginTop: 22,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "#888",
              }}
            >
              Nearest of each
            </div>
            <SlotBadge slotKey="a" />
            <SlotBadge slotKey="b" />
          </div>

          {categories.map((category) => {
            const rowA = results.a?.breakdown.find((r) => r.category === category);
            const rowB = results.b?.breakdown.find((r) => r.category === category);
            return (
              <div
                key={category}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 96px 96px",
                  gap: 10,
                  alignItems: "baseline",
                  padding: "9px 0",
                  borderTop: "1px solid #eee",
                }}
              >
                <div style={{ fontWeight: 500 }}>
                  {CATEGORY_LABEL[category] ?? category}
                </div>
                {cell(rowA, rowB)}
                {cell(rowB, rowA)}
              </div>
            );
          })}

          <p style={{ color: "#888", fontSize: 12.5, marginTop: 14 }}>
            Walking distance along the street network. Bold marks whichever of
            the two is closer.
          </p>
        </>
      )}
    </div>
  );
}
