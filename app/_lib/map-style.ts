import type { StyleSpecification } from "maplibre-gl";
import {
  BANDS,
  COMPARE_OPACITY,
  EMPTY_GEOJSON,
  ROUTE_COLOR,
  SLOT_COLOR,
} from "./walkreach";

export type SourceId = "isochrone-a" | "isochrone-b" | "route";

// One place shows its walk as three bands; comparing, each place fills its
// whole walk in its own colour. Both sets of layers are always there and
// setCompareLayers switches which is visible.
export const SINGLE_LAYERS = ["isochrone-fill", "isochrone-outline"];
export const COMPARE_LAYERS = ["compare-a-fill", "compare-b-fill"];

// A pale vector basemap, so the walk and the route are the only strong
// colours on the map. OpenFreeMap needs no key and sets no usage limit, but
// its style carries no attribution of its own, so it is added here.
const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const BASE_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

// What the map falls back to if the style cannot be fetched: the standard
// OpenStreetMap tiles, busier but always there.
const FALLBACK_BASE: StyleSpecification = {
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
};

export async function loadBaseStyle(): Promise<StyleSpecification> {
  try {
    const res = await fetch(BASE_STYLE_URL);
    if (!res.ok) return FALLBACK_BASE;
    const style = (await res.json()) as StyleSpecification;
    const source = style.sources.openmaptiles;
    if (source?.type === "vector") source.attribution = BASE_ATTRIBUTION;
    return style;
  } catch {
    return FALLBACK_BASE;
  }
}

// The basemap with WalkReach's own sources and layers added. They go under
// the basemap's first label layer, so street and suburb names stay readable
// over the bands.
export function withOverlays(base: StyleSpecification): StyleSpecification {
  const firstLabel = base.layers.findIndex((l) => l.type === "symbol");
  const at = firstLabel === -1 ? base.layers.length : firstLabel;
  return {
    ...base,
    sources: { ...base.sources, ...OVERLAY_SOURCES },
    layers: [...base.layers.slice(0, at), ...OVERLAY_LAYERS, ...base.layers.slice(at)],
  };
}

const OVERLAY_SOURCES: StyleSpecification["sources"] = {
  "isochrone-a": { type: "geojson", data: EMPTY_GEOJSON },
  "isochrone-b": { type: "geojson", data: EMPTY_GEOJSON },
  route: { type: "geojson", data: EMPTY_GEOJSON },
};

const OVERLAY_LAYERS: StyleSpecification["layers"] = [
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
  // The walk to a picked amenity, cased in white so it stays
  // readable over any of the band colours. The connectors are the
  // stretches off the network the distance does not count, so they
  // are dashed and thinner.
  {
    id: "route-casing",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "walk"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#ffffff", "line-width": 8 },
  },
  {
    id: "route-line",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "walk"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": ROUTE_COLOR, "line-width": 4.5 },
  },
  {
    id: "route-connector",
    type: "line",
    source: "route",
    filter: ["==", ["get", "kind"], "connector"],
    paint: {
      "line-color": ROUTE_COLOR,
      "line-width": 2.5,
      "line-dasharray": [1.5, 1.5],
    },
  },
  {
    id: "route-destination",
    type: "circle",
    source: "route",
    filter: ["==", ["get", "kind"], "destination"],
    paint: {
      "circle-radius": 7,
      "circle-color": ROUTE_COLOR,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  },
];
