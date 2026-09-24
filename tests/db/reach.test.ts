import { afterAll, describe, expect, it } from "vitest";
import { analyse, pool, type Point } from "./db";

afterAll(() => pool.end());

type Route = {
  amenity: { id: number; category: string; name: string | null; walk_m: number };
  destination: { type: "Point"; coordinates: [number, number] };
  route: { type: string; coordinates: unknown[] };
  connectors: { type: "MultiLineString"; coordinates: [number, number][][] };
};

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

      // The line drawn is the walk measured, to the metre, unless the start
      // is one of the amenity's own nodes and there is no line at all.
      const { rows } = await pool.query(
        "SELECT ST_Length(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) AS m",
        [JSON.stringify(r!.route)],
      );
      // The connectors run from the point itself and end on the amenity.
      const [first, last] = r!.connectors.coordinates;
      expect(first[0]).toEqual([point.lng, point.lat]);
      expect(last[1]).toEqual(r!.destination.coordinates);

      if (listed.walk_m === 0) expect(r!.route.coordinates).toEqual([]);
      else expect(Math.abs(rows[0].m - listed.walk_m)).toBeLessThanOrEqual(1);
    }
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
