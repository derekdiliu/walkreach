"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type Breakdown = { category: string; weighted_score: string };
type Result = {
  location: { lng: number; lat: number };
  total_score: number;
  breakdown: Breakdown[];
};

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let map: any;
    let cancelled = false;

    (async () => {
      const { Map: MapLibreMap, Marker } = await import("maplibre-gl");

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

      map.on("click", async (e: any) => {
        const { lng, lat } = e.lngLat;

        if (markerRef.current) markerRef.current.remove();
        markerRef.current = new Marker()
          .setLngLat([lng, lat])
          .addTo(map);

        setLoading(true);
        setResult(null);
        try {
          const res = await fetch(`/api/livability?lng=${lng}&lat=${lat}`);
          const data = await res.json();
          setResult(data);
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
          </div>
        )}
      </div>
    </div>
  );
}
