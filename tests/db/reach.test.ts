import { afterAll, describe, expect, it } from "vitest";
import { analyse, pool, type Point } from "./db";

afterAll(() => pool.end());

type Route = {
  amenity: { id: number; category: string; name: string | null; walk_m: number };
  destination: { type: "Point"; coordinates: [number, number] };
  route: { type: string; coordinates: unknown[] };
  connectors: { type: "MultiLineString"; coordinates: [number, number][][] };
  start_m: number;
};

const lengthM = async (geojson: unknown): Promise<number> =>
  (
    await pool.query(
      "SELECT ST_Length(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) AS m",
      [JSON.stringify(geojson)],
    )
  ).rows[0].m;

async function route(from: Point, amenity: number): Promise<Route | null> {
  const { rows } = await pool.query("SELECT walkreach_route($1, $2, $3) AS r", [
    from.lng,
    from.lat,
    amenity,
  ]);
  return rows[0].r;
}

const SAMPLES: Record<string, Point> = {
  cbd: { lng: 175.2793, lat: -37.7871 },
  "hamilton east": { lng: 175.308185, lat: -37.7857515 },
  "north-west": { lng: 175.2570103, lat: -37.7376565 },
};

describe.each(Object.entries(SAMPLES))("what is within reach of %s", (_, point) => {
  it("lists each amenity once, nearest first, all inside the walk", async () => {
    const { amenities } = await analyse(point);
    expect(amenities.length).toBeGreaterThan(0);
    expect(new Set(amenities.map((a) => a.id)).size).toBe(amenities.length);
    const walks = amenities.map((a) => a.walk_m);
    expect(walks).toEqual([...walks].sort((x, y) => x - y));
    expect(Math.max(...walks)).toBeLessThanOrEqual(1250);
  });

  it("agrees with the breakdown on the nearest of each kind", async () => {
    const { amenities, breakdown } = await analyse(point);
    for (const b of breakdown) {
      const ofKind = amenities.filter((a) => a.category === b.category);
      if (b.nearest_m === null) expect(ofKind).toEqual([]);
      else expect(ofKind[0].walk_m).toBe(b.nearest_m);
    }
  });

  it("routes to the nearest and the farthest of each kind at the listed distance", async () => {
    const { amenities } = await analyse(point);
    const picks = new Set<number>();
    for (const category of new Set(amenities.map((a) => a.category))) {
      const ofKind = amenities.filter((a) => a.category === category);
      picks.add(ofKind[0].id);
      picks.add(ofKind[ofKind.length - 1].id);
    }

    for (const id of picks) {
      const listed = amenities.find((a) => a.id === id)!;
      const r = await route(point, id);
      expect(r, `route to ${id}`).not.toBeNull();
      expect(r!.amenity).toEqual(listed);

      // The connectors run from the point itself and end on the amenity.
      const [first, last] = r!.connectors.coordinates;
      expect(first[0]).toEqual([point.lng, point.lat]);
      expect(last[1]).toEqual(r!.destination.coordinates);

      // The walk measured is the line drawn plus the last stretch to the
      // amenity, to within rounding. There is no line when the start is one
      // of the amenity's own nodes. start_m is the first stretch, which the
      // API adds.
      const line = r!.route.coordinates.length ? await lengthM(r!.route) : 0;
      const end = await lengthM({ type: "LineString", coordinates: last });
      expect(Math.abs(line + end - listed.walk_m)).toBeLessThanOrEqual(1.5);
      expect(Math.abs((await lengthM({ type: "LineString", coordinates: first })) - r!.start_m))
        .toBeLessThanOrEqual(0.5);
    }
  });
});

describe.each(Object.entries(SAMPLES))("distances from %s", (_, point) => {
  // The walk from the start vertex to an amenity cannot beat the straight
  // line between them. Before the last stretch was counted it often did: the
  // CBD's nearest bus stop read as a 60 m walk, 131 m away as the crow flies.
  it("never come out shorter than the straight line from the start", async () => {
    const { amenities } = await analyse(point);
    const { rows } = await pool.query(
      `SELECT a.id, ST_Distance(COALESCE(a.area, a.geom)::geography, v.geom::geography) AS m
       FROM amenities a, ways_vertices_pgr v
       WHERE a.id = ANY($1) AND v.id = (SELECT node FROM walkreach_origin($2, $3))`,
      [amenities.map((a) => a.id), point.lng, point.lat],
    );
    const straight = new Map(rows.map((r) => [r.id, r.m]));
    for (const a of amenities) expect(a.walk_m, `amenity ${a.id}`).toBeGreaterThanOrEqual(straight.get(a.id) - 0.5);
  });
});

describe("the start of a walk", () => {
  it("is the nearest vertex, with the straight stretch to it", async () => {
    const { rows } = await pool.query("SELECT * FROM walkreach_origin(175.2793, -37.7871)");
    expect(rows[0].node).not.toBeNull();
    expect(rows[0].start_m).toBeGreaterThan(0);
    expect(rows[0].start_m).toBeLessThan(200);
  });

  it("is nowhere off the network", async () => {
    const { rows } = await pool.query("SELECT * FROM walkreach_origin(175.35, -37.79)");
    expect(rows).toEqual([{ node: null, start_m: null }]);
  });
});

describe("routes that cannot be walked", () => {
  it("returns nothing for an amenity beyond 15 minutes", async () => {
    const cbd = SAMPLES.cbd;
    const { amenities } = await analyse(cbd);
    const reached = new Set(amenities.map((a) => a.id));
    const { rows } = await pool.query(
      "SELECT id FROM amenities ORDER BY id LIMIT 50",
    );
    const beyond = rows.map((r) => r.id).find((id: number) => !reached.has(id));
    expect(beyond).toBeDefined();
    expect(await route(cbd, beyond)).toBeNull();
  });

  it("returns nothing from off the network, where nothing is listed", async () => {
    const farmland = { lng: 175.35, lat: -37.79 };
    expect((await analyse(farmland)).amenities).toEqual([]);
    const { rows } = await pool.query("SELECT min(id) AS id FROM amenities");
    expect(await route(farmland, rows[0].id)).toBeNull();
  });

  it("returns nothing for an amenity that does not exist", async () => {
    expect(await route(SAMPLES.cbd, -1)).toBeNull();
  });
});

describe("amenity names", () => {
  // ogr2ogr puts name in a column of its own on the points layer, not in
  // other_tags, and reading it from other_tags left every point unnamed.
  it("keeps the name OSM gives every point amenity", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS lost
       FROM amenities a JOIN amenities_points p ON p.geom = a.geom
       WHERE a.area IS NULL AND p.name IS NOT NULL
         AND a.name IS DISTINCT FROM p.name`,
    );
    expect(rows[0].lost).toBe(0);
  });

  it("names the Woolworths at Chartwell, a point tagged with a brand", async () => {
    const { breakdown } = await analyse({ lng: 175.27811, lat: -37.74996 });
    const supermarket = breakdown.find((b) => b.category === "supermarket")!;
    expect(supermarket.nearest_name).toBe("Woolworths");
  });
});
