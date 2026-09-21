import { afterAll, describe, expect, it } from "vitest";
import { analyse, bandCovering, networkM, pool, straightLineM, type Point } from "./db";

afterAll(() => pool.end());

// 15 minutes at 1.4 m/s, the budget walkreach_analysis traverses.
const BUDGET_M = 1250;

// Between Fairfield Bridge and the Wairere Drive bridge the Waikato has no
// crossing for about 3.5 km. River Road on the east bank faces Saint Andrews
// Terrace on the west across the water.
const RIVER_ROAD: Point = { lng: 175.26704, lat: -37.75639 };
const ST_ANDREWS_TCE: Point = { lng: 175.26371, lat: -37.75592 };
// The same distance from River Road, but on its own bank.
const RIVER_ROAD_NEIGHBOUR: Point = { lng: 175.2685, lat: -37.7585 };
// Either side of Fairfield Bridge: across the river, but with a crossing.
const FAIRFIELD_EAST: Point = { lng: 175.2716, lat: -37.7709 };
const FAIRFIELD_WEST: Point = { lng: 175.2688, lat: -37.7728 };

describe("the river as a barrier", () => {
  it("leaves the opposite bank out of the catchment when no crossing is in reach", async () => {
    expect(await straightLineM(RIVER_ROAD, ST_ANDREWS_TCE)).toBeLessThan(300);
    expect(await bandCovering(RIVER_ROAD, ST_ANDREWS_TCE)).toBeNull();
  });

  it("measures the walk to the opposite bank round the nearest bridge", async () => {
    const straight = await straightLineM(RIVER_ROAD, ST_ANDREWS_TCE);
    const walk = await networkM(RIVER_ROAD, ST_ANDREWS_TCE);
    expect(walk).not.toBeNull();
    expect(walk!).toBeGreaterThan(BUDGET_M);
    // More than ten times the straight line: the detour a buffer would miss.
    expect(walk! / straight).toBeGreaterThan(10);
  });

  it("includes a point as far away on the same bank", async () => {
    const straight = await straightLineM(RIVER_ROAD, RIVER_ROAD_NEIGHBOUR);
    expect(straight).toBeLessThan(300);
    expect(await bandCovering(RIVER_ROAD, RIVER_ROAD_NEIGHBOUR)).not.toBeNull();
  });

  it("includes the opposite bank where a bridge is in reach", async () => {
    expect(await straightLineM(FAIRFIELD_EAST, FAIRFIELD_WEST)).toBeGreaterThan(300);
    expect(await bandCovering(FAIRFIELD_EAST, FAIRFIELD_WEST)).toBeLessThanOrEqual(10);
    // Walking is symmetric: the same pair from the other side.
    expect(await bandCovering(FAIRFIELD_WEST, FAIRFIELD_EAST)).toBeLessThanOrEqual(10);
  });
});

// Starting points spread across the city: centre, suburbs, both banks.
const SAMPLES: Record<string, Point> = {
  cbd: { lng: 175.2793, lat: -37.7871 },
  "river road": RIVER_ROAD,
  "north-west": { lng: 175.2570103, lat: -37.7376565 },
  "hamilton east": { lng: 175.308185, lat: -37.7857515 },
  "south": { lng: 175.2749877, lat: -37.8053868 },
};

describe.each(Object.entries(SAMPLES))("isochrone bands from %s", (_, point) => {
  it("returns the 5, 10 and 15 minute bands, longest first", async () => {
    const { isochrone } = await analyse(point);
    expect(isochrone.type).toBe("FeatureCollection");
    expect(isochrone.features.map((f) => f.properties.minutes)).toEqual([15, 10, 5]);
  });

  it("draws valid polygons that do not overlap each other", async () => {
    // Each band is a ring: the area it adds over the shorter walk. Overlap
    // would stack the translucent fills and blur which band is which.
    const { rows } = await pool.query(
      `WITH f AS (
         SELECT (f->'properties'->>'minutes')::int AS m,
                ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry'), 4326) AS g
         FROM jsonb_array_elements(walkreach_analysis($1, $2)->'isochrone'->'features') f)
       SELECT bool_and(ST_IsValid(g)) AS valid,
              bool_and(ST_GeometryType(g) IN ('ST_Polygon', 'ST_MultiPolygon')) AS polygonal,
              (SELECT coalesce(max(ST_Area(ST_Intersection(a.g, b.g)::geography)), 0)
                 FROM f a JOIN f b ON a.m < b.m) AS overlap_m2
       FROM f`,
      [point.lng, point.lat],
    );
    expect(rows[0].valid).toBe(true);
    expect(rows[0].polygonal).toBe(true);
    expect(rows[0].overlap_m2).toBeLessThan(1);
  });

  it("covers nearly every node reachable in 15 minutes", async () => {
    // The outline is smoothed, so it trims the odd dead end; it should not
    // drop a meaningful share of where you can actually walk.
    const { rows } = await pool.query(
      `WITH s AS (SELECT id FROM ways_vertices_pgr
                  ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) LIMIT 1),
            band AS (
              SELECT ST_Union(ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry'), 4326)) AS g
              FROM jsonb_array_elements(walkreach_analysis($1, $2)->'isochrone'->'features') f)
       SELECT avg(ST_Intersects(band.g, v.geom)::int)::float AS covered
       FROM s, band, pgr_drivingDistance(
         'SELECT id, source, target, length_m AS cost FROM ways', s.id, $3, false) dd
       JOIN ways_vertices_pgr v ON v.id = dd.node`,
      [point.lng, point.lat, BUDGET_M],
    );
    expect(rows[0].covered).toBeGreaterThan(0.9);
  });
});

describe("points off the walking network", () => {
  // Farther than this from any walkable way, the nearest vertex is somewhere
  // else entirely and its score would describe that place, not this one.
  it.each([
    ["farmland 2.3 km east of the network", { lng: 175.35, lat: -37.79 }],
    ["the Tasman Sea", { lng: 174.5, lat: -37.8 }],
  ])("scores %s as outside it", async (_, point) => {
    const a = await analyse(point);
    expect(a.total_score).toBe(0);
    expect(a.isochrone.features).toEqual([]);
    expect(a.breakdown).toHaveLength(5);
    expect(a.breakdown.every((b) => b.nearest_m === null && b.weighted_score === 0)).toBe(true);
  });

  it("still scores a point well back from the nearest path", async () => {
    // Out on Hamilton Lake, about 180 m from the lakeside path.
    const a = await analyse({ lng: 175.2745, lat: -37.7985 });
    expect(a.total_score).toBeGreaterThan(0);
  });
});
