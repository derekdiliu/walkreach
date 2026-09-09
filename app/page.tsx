"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type Breakdown = {
  category: string;
  weighted_score: number;
  max_score: number;
  nearest_m: number | null;
};
type Result = {
  location: { lng: number; lat: number };
  total_score: number;
  breakdown: Breakdown[];
  isochrone: { type: string; features: any[] };
};

const EMPTY_GEOJSON = { type: "FeatureCollection" as const, features: [] };

const BANDS = [
  { minutes: 5, color: "#2c5f6f" },
  { minutes: 10, color: "#5fa8bd" },
  { minutes: 15, color: "#a8d5e2" },
];

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
                "fill-opacity": 0.35,
                "fill-outline-color": "#ffffff",
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

  const tryCityCentre = () => {
    mapRef.current?.flyTo({ center: CITY_CENTRE, zoom: 14 });
    analyseRef.current?.(CITY_CENTRE[0], CITY_CENTRE[1]);
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
                  Click anywhere on the map — a street, a suburb, a place
                  you are thinking of renting.
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
        <p style={{ color: "#666", marginBottom: 20 }}>
          Walking accessibility in Hamilton, NZ
        </p>

        {!result && !loading && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>
              How much of everyday life is within a short walk?
            </p>
            <p style={{ marginBottom: 10 }}>
              Click any point on the map. WalkReach traces how far you can
              actually walk from there in 5, 10 and 15 minutes, then scores how
              close the nearest supermarket, clinic, school, park and bus stop
              are.
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
                fontSize: 11,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "#888",
              }}
            >
              Walkability score
            </div>
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#2c5f6f" }}>
              {result.total_score}
              <span style={{ fontSize: 20, color: "#999" }}> / 100</span>
            </div>
            <p style={{ color: "#666", marginTop: 4 }}>
              Each category scores by how close its nearest amenity is on foot,
              up to its own maximum.
            </p>

            <table
              style={{
                width: "100%",
                marginTop: 18,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr style={{ color: "#888", fontSize: 12, textAlign: "left" }}>
                  <th style={{ fontWeight: 400, paddingBottom: 6 }}>
                    Nearest
                  </th>
                  <th style={{ fontWeight: 400, paddingBottom: 6 }}>On foot</th>
                  <th
                    style={{
                      fontWeight: 400,
                      paddingBottom: 6,
                      textAlign: "right",
                    }}
                  >
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((b) => (
                  <tr key={b.category} style={{ borderTop: "1px solid #eee" }}>
                    <td
                      style={{ padding: "7px 0", textTransform: "capitalize" }}
                    >
                      {b.category.replace("_", " ")}
                    </td>
                    <td style={{ color: "#666" }}>
                      {b.nearest_m === null
                        ? "not within 15 min"
                        : `${b.nearest_m} m`}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 500 }}>
                      {b.weighted_score}
                      <span style={{ color: "#aaa", fontWeight: 400 }}>
                        {" "}
                        / {b.max_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  opacity: 0.6,
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
