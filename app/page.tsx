"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type Breakdown = { category: string; weighted_score: string };
type Result = {
  location: { lng: number; lat: number };
  total_score: number;
  breakdown: Breakdown[];
};

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };

const BANDS = [
  { minutes: 5, color: "#2c5f6f" },
  { minutes: 10, color: "#5fa8bd" },
  { minutes: 15, color: "#a8d5e2" },
];

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [offNetwork, setOffNetwork] = useState(false);

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
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [175.2793, -37.7871],
        zoom: 13,
      });

      mapRef.current = map;

      map.on("load", () => {
        map.addSource("isochrone", { type: "geojson", data: EMPTY_GEOJSON });
        map.addLayer({
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
        });
      });

      map.on("click", async (e: any) => {
        const { lng, lat } = e.lngLat;

        if (markerRef.current) markerRef.current.remove();
        markerRef.current = new Marker()
          .setLngLat([lng, lat])
          .addTo(map);

        setLoading(true);
        setResult(null);
        setOffNetwork(false);

        const source = map.getSource("isochrone");
        if (source) source.setData(EMPTY_GEOJSON);

        try {
          const [scoreRes, isoRes] = await Promise.all([
            fetch(`/api/livability?lng=${lng}&lat=${lat}`),
            fetch(`/api/isochrone?lng=${lng}&lat=${lat}`),
          ]);
          const score = await scoreRes.json();
          const iso = await isoRes.json();

          const polygons = (iso.features || []).filter(
            (f: any) =>
              f.geometry.type === "Polygon" ||
              f.geometry.type === "MultiPolygon",
          );

          setResult(score);
          setOffNetwork(polygons.length === 0);
          if (source) {
            source.setData({ type: "FeatureCollection", features: polygons });
          }
        } catch {
          setResult(null);
        }
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div ref={mapContainer} style={{ flex: 1 }} />
      <div
        style={{
          width: 320,
          padding: 20,
          fontFamily: "sans-serif",
          overflowY: "auto",
        }}
      >
        <h2>WalkReach</h2>
        <p style={{ color: "#666", fontSize: 14 }}>
          Click anywhere on the map to see its walkability score.
        </p>
        {loading && <p>Calculating…</p>}
        {offNetwork && (
          <p style={{ color: "#a33", fontSize: 14 }}>
            This location is outside the Hamilton walking network — no
            catchment could be computed.
          </p>
        )}
        {result && result.breakdown && (
          <div>
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#2c5f6f" }}>
              {result.total_score}
              <span style={{ fontSize: 20, color: "#999" }}> / 100</span>
            </div>
            <table style={{ width: "100%", marginTop: 16, fontSize: 14 }}>
              <tbody>
                {result.breakdown.map((b) => (
                  <tr key={b.category}>
                    <td
                      style={{ padding: "4px 0", textTransform: "capitalize" }}
                    >
                      {b.category.replace("_", " ")}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 500 }}>
                      {b.weighted_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!offNetwork && (
              <div style={{ marginTop: 20, fontSize: 13, color: "#666" }}>
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
                    {band.minutes} min walk
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
