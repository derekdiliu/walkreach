import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The route builds its Pool at import time, so pg is swapped out before the
// import below. All the route does with it is one query, which each test
// scripts through query.
const query = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = query;
  },
}));

const { GET } = await import("@/app/api/livability/route");

const get = (qs: string) =>
  GET(new NextRequest(`http://localhost/api/livability${qs}`));

const ANALYSIS = {
  total_score: 81.6,
  breakdown: [
    { category: "bus_stop", weighted_score: 9.4, max_score: 10, nearest_m: 78, nearest_name: null },
  ],
  amenities: [{ id: 1041, category: "bus_stop", name: null, walk_m: 78 }],
  isochrone: { type: "FeatureCollection", features: [] },
};

beforeEach(() => {
  query.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/livability", () => {
  it.each([
    ["no parameters", ""],
    ["lat missing", "?lng=175.28"],
    ["lng missing", "?lat=-37.78"],
    ["non-numeric lng", "?lng=abc&lat=-37.78"],
    ["empty values", "?lng=&lat="],
    // parseFloat used to read the number off the front and drop the rest.
    ["trailing junk after lng", "?lng=175abc&lat=-37.78"],
    ["trailing junk after lat", "?lng=175.28&lat=-37.78xyz"],
    ["a second number glued on", "?lng=175.28.5&lat=-37.78"],
    // Number would take all of these.
    ["whitespace", "?lng=%20175.28%20&lat=-37.78"],
    ["hexadecimal", "?lng=0xAF&lat=-37.78"],
    ["Infinity", "?lng=Infinity&lat=-37.78"],
    ["NaN spelled out", "?lng=NaN&lat=-37.78"],
    // Numbers, but nowhere on Earth.
    ["latitude past the pole", "?lng=175.28&lat=999"],
    ["latitude just past the pole", "?lng=175.28&lat=-90.0001"],
    ["longitude past the antimeridian", "?lng=180.5&lat=-37.78"],
    ["longitude in exponent form, out of range", "?lng=1e5&lat=-37.78"],
    // Which one would be meant?
    ["lng given twice", "?lng=175.28&lng=175.30&lat=-37.78"],
    ["a script in place of a number", "?lng=%3Cscript%3E&lat=-37.78"],
    ["SQL in place of a number", "?lng=175.28;DROP%20TABLE%20ways&lat=-37.78"],
  ])("rejects %s with 400 and never queries", async (_, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing or invalid lng/lat parameters" });
    expect(query).not.toHaveBeenCalled();
  });

  it("passes the coordinates as bind parameters, lng first", async () => {
    query.mockResolvedValue({ rows: [{ analysis: ANALYSIS }] });
    await get("?lng=175.2793&lat=-37.7871");
    expect(query).toHaveBeenCalledWith(
      "SELECT walkreach_analysis($1, $2) AS analysis",
      [175.2793, -37.7871],
    );
  });

  it.each([
    ["the edges of the globe", "?lng=-180&lat=90", [-180, 90]],
    ["a leading plus and no integer part", "?lng=%2B175.28&lat=-.5", [175.28, -0.5]],
    ["exponent form in range", "?lng=1.7528e2&lat=-3.778e1", [175.28, -37.78]],
    // Outside Hamilton is a fair question; the database answers it as off
    // the network rather than the API refusing it.
    ["a point in Auckland", "?lng=174.7633&lat=-36.8485", [174.7633, -36.8485]],
  ])("accepts %s", async (_, qs, point) => {
    query.mockResolvedValue({ rows: [{ analysis: ANALYSIS }] });
    const res = await get(qs);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.any(String), point);
  });

  it("returns the analysis with the location it was asked about", async () => {
    query.mockResolvedValue({ rows: [{ analysis: ANALYSIS }] });
    const res = await get("?lng=175.2793&lat=-37.7871");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      location: { lng: 175.2793, lat: -37.7871 },
      ...ANALYSIS,
    });
  });

  it("does not pass through anything else the function returns", async () => {
    query.mockResolvedValue({ rows: [{ analysis: { ...ANALYSIS, debug: "x" } }] });
    const body = await (await get("?lng=175.2793&lat=-37.7871")).json();
    expect(Object.keys(body).sort()).toEqual(
      ["amenities", "breakdown", "isochrone", "location", "total_score"],
    );
  });

  it("answers 500 without leaking the database error", async () => {
    query.mockRejectedValue(new Error('relation "ways" does not exist'));
    const res = await get("?lng=175.2793&lat=-37.7871");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Database query failed" });
  });
});
