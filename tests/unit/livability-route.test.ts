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
      ["breakdown", "isochrone", "location", "total_score"],
    );
  });

  it("answers 500 without leaking the database error", async () => {
    query.mockRejectedValue(new Error('relation "ways" does not exist'));
    const res = await get("?lng=175.2793&lat=-37.7871");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Database query failed" });
  });
});
