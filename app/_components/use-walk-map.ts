"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FitBoundsOptions,
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { COMPARE_LAYERS, MAP_STYLE, SINGLE_LAYERS, type SourceId } from "../_lib/map-style";
import {
  CITY_CENTRE,
  SLOT_COLOR,
  type Isochrone,
  type LngLat,
  type SlotKey,
} from "../_lib/walkreach";

// The MapLibre map, its two pins and its three GeoJSON sources. The page only
// ever talks to the map through what this returns.
export function useWalkMap({
  compare,
  onClick,
}: {
  compare: boolean;
  onClick: (p: LngLat) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerClassRef = useRef<typeof Marker | null>(null);
  const markersRef = useRef<Record<SlotKey, Marker | null>>({ a: null, b: null });
  const clickRef = useRef(onClick);
  const [ready, setReady] = useState(false);

  // The click handler is bound once, so point it at the latest one.
  useEffect(() => {
    clickRef.current = onClick;
  });

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;

    (async () => {
      const maplibre = await import("maplibre-gl");

      // MapLibre resolves its worker from import.meta.url, which Turbopack
      // rewrites to a chunk path where the worker file does not exist. The
      // worker then dies silently and anything parsed off the main thread
      // (GeoJSON sources) never renders. Point it at the copy in public/.
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      if (cancelled || mapRef.current || !containerRef.current) return;

      map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [CITY_CENTRE.lng, CITY_CENTRE.lat],
        zoom: 13,
      });

      mapRef.current = map;
      markerClassRef.current = maplibre.Marker;
      setReady(true);
      map.on("click", (e) => clickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
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
    if (!ready || !map) return;

    const apply = () => {
      for (const id of SINGLE_LAYERS)
        map.setLayoutProperty(id, "visibility", compare ? "none" : "visible");
      for (const id of COMPARE_LAYERS)
        map.setLayoutProperty(id, "visibility", compare ? "visible" : "none");
    };
    // Not isStyleLoaded(): it stays false while any tile is still loading,
    // and "load" has long since fired by then, so the switch would never
    // apply. The layers existing is all setLayoutProperty needs.
    if (map.getLayer(COMPARE_LAYERS[0])) apply();
    else map.once("styledata", apply);
  }, [compare, ready]);

  // A click can still land before the style has finished parsing, so hold
  // the data until the source is there rather than dropping it.
  const setData = (id: SourceId, data: GeoJSON) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(id);
    if (source) source.setData(data);
    else map.once("styledata", () => map.getSource<GeoJSONSource>(id)?.setData(data));
  };

  const putMarker = (key: SlotKey, p: LngLat, coloured: boolean) => {
    const map = mapRef.current;
    const MarkerClass = markerClassRef.current;
    if (!map || !MarkerClass) return;
    markersRef.current[key]?.remove();
    markersRef.current[key] = new MarkerClass(coloured ? { color: SLOT_COLOR[key] } : {})
      .setLngLat([p.lng, p.lat])
      .addTo(map);
  };

  const removeMarker = (key: SlotKey) => {
    markersRef.current[key]?.remove();
    markersRef.current[key] = null;
  };

  const flyTo = (p: LngLat, zoom: number) =>
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom });

  const jumpTo = (p: LngLat, zoom: number) =>
    mapRef.current?.jumpTo({ center: [p.lng, p.lat], zoom });

  const fitBounds = (bounds: LngLatBoundsLike, options: FitBoundsOptions) =>
    mapRef.current?.fitBounds(bounds, options);

  // Frame the whole walk, unless it is already on screen: a click well inside
  // the view should not move the map under the cursor. A search flies to the
  // point first, so wait for that to land before judging what is in view.
  const showWalk = (isochrone: Isochrone) => {
    const map = mapRef.current;
    const coords = isochrone.features.flatMap((f) =>
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates.flat()
        : f.geometry.coordinates.flat(2),
    );
    if (!map || coords.length === 0) return;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    const fit = () => {
      const view = map.getBounds();
      if (!view.contains(sw) || !view.contains(ne))
        map.fitBounds([sw, ne], { padding: 32, maxZoom: 16 });
    };
    if (map.isMoving()) map.once("moveend", fit);
    else fit();
  };

  // Frame both walks, not just both pins: each can reach 1,250 m out, which
  // at Hamilton's latitude is about 0.0112 degrees of latitude and 0.0142 of
  // longitude.
  const fitBoth = (p: LngLat, q: LngLat) =>
    fitBounds(
      [
        [Math.min(p.lng, q.lng) - 0.0142, Math.min(p.lat, q.lat) - 0.0112],
        [Math.max(p.lng, q.lng) + 0.0142, Math.max(p.lat, q.lat) + 0.0112],
      ],
      { padding: 24 },
    );

  // On a phone the panel is below the map, so something drawn from the panel
  // would be out of sight. Bring the map back up; side by side it never
  // leaves the screen and this does nothing.
  const scrollIntoView = () => {
    const pane = containerRef.current?.parentElement;
    if (pane && pane.getBoundingClientRect().top < 0)
      pane.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return {
    containerRef,
    ready,
    setData,
    putMarker,
    removeMarker,
    flyTo,
    jumpTo,
    fitBounds,
    showWalk,
    fitBoth,
    scrollIntoView,
  };
}

export type WalkMap = ReturnType<typeof useWalkMap>;
