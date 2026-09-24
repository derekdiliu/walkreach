"use client";

import { useRef, useState } from "react";
import type { Position } from "geojson";
import { EMPTY_GEOJSON, type LngLat, type Reached, type Route } from "../_lib/walkreach";
import type { WalkMap } from "./use-walk-map";

// The walk to one picked amenity, drawn on the map's route source.
export function useWalkRoute(map: WalkMap) {
  const [selected, setSelected] = useState<number | null>(null);
  // Bumped on every pick and clear, so a slow answer for an amenity no longer
  // picked is not drawn.
  const requestRef = useRef(0);

  const clear = () => {
    requestRef.current++;
    setSelected(null);
    map.setData("route", EMPTY_GEOJSON);
  };

  // Picking the one already shown takes it away.
  const toggle = async (from: LngLat, amenity: Reached) => {
    if (selected === amenity.id) return clear();

    const request = ++requestRef.current;
    setSelected(amenity.id);
    map.setData("route", EMPTY_GEOJSON);
    map.scrollIntoView();

    let data: Route | null;
    try {
      const res = await fetch(
        `/api/route?lng=${from.lng}&lat=${from.lat}&amenity=${amenity.id}`,
      );
      data = res.ok ? await res.json() : null;
    } catch {
      data = null;
    }

    if (request !== requestRef.current) return;
    if (!data) return setSelected(null);

    map.setData("route", {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { kind: "walk" }, geometry: data.route },
        { type: "Feature", properties: { kind: "connector" }, geometry: data.connectors },
        { type: "Feature", properties: { kind: "destination" }, geometry: data.destination },
      ],
    });

    // Frame the pin, the walk and the amenity together.
    const coords: Position[] = [
      [from.lng, from.lat],
      data.destination.coordinates,
      ...data.connectors.coordinates.flat(),
      ...(data.route.type === "MultiLineString"
        ? data.route.coordinates.flat()
        : data.route.coordinates),
    ];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: 17 },
    );
  };

  return { selected, toggle, clear };
}
