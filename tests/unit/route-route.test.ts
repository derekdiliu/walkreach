import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// As in livability-route.test.ts: pg is swapped out before the route builds
// its Pool, and each test scripts the one query.
const query = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = query;
  },
}));

const { GET } = await import("@/app/api/route/route");

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/route${qs}`));

const ROUTE = {
  amenity: { id: 1452, category: "supermarket", name: "NewSave", walk_m: 403 },
  destination: { type: "Point", coordinates: [175.2758777, -37.786535] },
  route: { type: "LineString", coordinates: [[175.279, -37.787], [175.2759, -37.7865]] },
  connectors: {
    type: "MultiLineString",
    coordinates: [
      [[175.2793, -37.7871], [175.279, -37.787]],
      [[175.2759, -37.7865], [175.2758777, -37.786535]],
    ],
  },
};

beforeEach(() => {
  query.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/route", () => {
  it.each([
    ["no parameters", ""],
    ["amenity missing", "?lng=175.28&lat=-37.78"],
    ["non-numeric amenity", "?lng=175.28&lat=-37.78&amenity=abc"],
    ["fractional amenity", "?lng=175.28&lat=-37.78&amenity=1.5"],
    ["zero amenity", "?lng=175.28&lat=-37.78&amenity=0"],
    ["lat missing", "?lng=175.28&amenity=1452"],
    ["negative amenity", "?lng=175.28&lat=-37.78&amenity=-5"],
    ["amenity with trailing junk", "?lng=175.28&lat=-37.78&amenity=12abc"],
    ["amenity in hexadecimal", "?lng=175.28&lat=-37.78&amenity=0x10"],
    ["amenity in exponent form", "?lng=175.28&lat=-37.78&amenity=1e3"],
    ["amenity padded with spaces", "?lng=175.28&lat=-37.78&amenity=%2012%20"],
    // Past a Postgres integer, it would fail in the database as a 500.
    ["amenity past a Postgres integer", "?lng=175.28&lat=-37.78&amenity=2147483648"],
    ["amenity given twice", "?lng=175.28&lat=-37.78&amenity=1&amenity=2"],
    ["latitude past the pole", "?lng=175.28&lat=999&amenity=1452"],
    ["lng with trailing junk", "?lng=175abc&lat=-37.78&amenity=1452"],
  ])("rejects %s with 400 and never queries", async (_, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing or invalid lng/lat/amenity parameters",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("passes the point and the amenity as bind parameters", async () => {
    query.mockResolvedValue({ rows: [{ route: ROUTE }] });
    await get("?lng=175.2793&lat=-37.7871&amenity=1452");
    expect(query).toHaveBeenCalledWith(
      "SELECT walkreach_route($1, $2, $3) AS route",
      [175.2793, -37.7871, 1452],
    );
  });

  it("accepts the largest id a Postgres integer holds", async () => {
    query.mockResolvedValue({ rows: [{ route: null }] });
    const res = await get("?lng=175.2793&lat=-37.7871&amenity=2147483647");
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledWith(expect.any(String), [175.2793, -37.7871, 2147483647]);
  });

  it("returns the route and nothing else the function returns", async () => {
    query.mockResolvedValue({ rows: [{ route: { ...ROUTE, debug: "x" } }] });
    const res = await get("?lng=175.2793&lat=-37.7871&amenity=1452");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ROUTE);
  });

  it("answers 404 when the amenity is out of reach", async () => {
    query.mockResolvedValue({ rows: [{ route: null }] });
    const res = await get("?lng=175.2793&lat=-37.7871&amenity=1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Amenity not within a 15 minute walk" });
  });

  it("answers 500 without leaking the database error", async () => {
    query.mockRejectedValue(new Error('function walkreach_route does not exist'));
    const res = await get("?lng=175.2793&lat=-37.7871&amenity=1452");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Database query failed" });
  });
});
