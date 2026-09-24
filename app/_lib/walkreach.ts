// The shapes the APIs return, and the pure helpers and constants the page
// builds on. Nothing here touches the map or React.
import type {
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

export type LngLat = { lng: number; lat: number };
export type Place = LngLat & { label: string };
export type SlotKey = "a" | "b";

export type Breakdown = {
  category: string;
  weighted_score: number;
  max_score: number;
  nearest_m: number | null;
  nearest_name: string | null;
};

export type Reached = {
  id: number;
  category: string;
  name: string | null;
  walk_m: number;
};

export type Isochrone = FeatureCollection<Polygon | MultiPolygon, { minutes: number }>;

// GET /api/livability
export type Result = {
  location: LngLat;
  total_score: number;
  breakdown: Breakdown[];
  amenities: Reached[];
  isochrone: Isochrone;
};

// GET /api/route
export type Route = {
  amenity: Reached;
  destination: Point;
  route: LineString | MultiLineString;
  connectors: MultiLineString;
};

// GET /api/suggest
export type Suggestion = {
  label: string;
  kind: string;
  context: string | null;
  point: LngLat | null;
};

export type Slot = {
  // label is null for a point clicked on the map rather than searched for
  point: (LngLat & { label: string | null }) | null;
  result: Result | null;
  loading: boolean;
};

export const EMPTY_SLOT: Slot = { point: null, result: null, loading: false };

export const EMPTY_GEOJSON: FeatureCollection = { type: "FeatureCollection", features: [] };

export const CITY_CENTRE: LngLat = { lng: 175.2793, lat: -37.7871 };

export const BANDS = [
  { minutes: 5, color: "#0d3b4f", opacity: 0.66 },
  { minutes: 10, color: "#3e93ad", opacity: 0.54 },
  { minutes: 15, color: "#a9dceb", opacity: 0.46 },
];

export const SLOT_COLOR: Record<SlotKey, string> = { a: "#1f78b4", b: "#e8710a" };
export const COMPARE_OPACITY = 0.38;

export const ROUTE_COLOR = "#c2410c";

export const CATEGORY_LABEL: Record<string, string> = {
  supermarket: "Supermarket",
  clinic: "Clinic",
  school: "School",
  park: "Park",
  bus_stop: "Bus stop",
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

export const scoreBand = (score: number) =>
  SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];

// The same cut-offs the bands on the map are drawn at: 1,250 m is 15 minutes.
export const walkMinutes = (m: number) => Math.max(1, Math.round((m / 1250) * 15));
export const withinMinutes = (m: number, minutes: number) => m <= (minutes / 15) * 1250;

export const categoryLabel = (category: string) => CATEGORY_LABEL[category] ?? category;

export const amenityName = (a: { name: string | null; category: string }) =>
  a.name ?? `Unnamed ${categoryLabel(a.category).toLowerCase()}`;

// "Area", "Street · Hamilton North", "Supermarket · Chartwell".
export const suggestionKind = (s: { kind: string; context: string | null }) => {
  const kind =
    s.kind === "place" ? "Area" : s.kind === "street" ? "Street" : categoryLabel(s.kind);
  return s.context ? `${kind} · ${s.context}` : kind;
};

export const isOffNetwork = (result: Result) => result.isochrone.features.length === 0;

export const formatPoint = (p: LngLat) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

export const parsePoint = (value: string | null): LngLat | null => {
  const [lng, lat] = (value ?? "").split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
};
