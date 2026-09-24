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

const { GET } = await import("@/app/api/suggest/route");

const get = (q: string) =>
  GET(new NextRequest(`http://localhost/api/suggest?q=${encodeURIComponent(q)}`));

const ROWS = [
  { name: "Hukanui Road", kind: "street", context: "Chartwell", lng: null, lat: null },
  { name: "Hukanui School", kind: "school", context: "Chartwell", lng: 175.29, lat: -37.75 },
];

beforeEach(() => {
  query.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/suggest", () => {
  it.each([
    ["one character", "h"],
    ["only spaces", "   "],
    ["over 100 characters", "a".repeat(101)],
  ])("rejects %s with 400 and never queries", async (_, q) => {
    const res = await get(q);
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("passes the trimmed text as a bind parameter", async () => {
    query.mockResolvedValue({ rows: [{ suggestions: [] }] });
    await get("  huk ");
    expect(query).toHaveBeenCalledWith("SELECT walkreach_suggest($1, $2) AS suggestions", ["huk", 6]);
  });

  it("gives a place or an amenity its point, and a street none", async () => {
    query.mockResolvedValue({ rows: [{ suggestions: ROWS }] });
    const body = await (await get("huk")).json();
    expect(body).toEqual({
      suggestions: [
        { label: "Hukanui Road", kind: "street", context: "Chartwell", point: null },
        { label: "Hukanui School", kind: "school", context: "Chartwell", point: { lng: 175.29, lat: -37.75 } },
      ],
    });
  });

  it.each([
    ["13 Huk", "13", "Huk"],
    ["13D Huk", "13D", "Huk"],
    ["2/17 Huk", "2/17", "Huk"],
  ])("keeps the house number of %s on streets only", async (q, number, text) => {
    query.mockResolvedValue({ rows: [{ suggestions: ROWS }] });
    const body = await (await get(q)).json();
    expect(query).toHaveBeenCalledWith(expect.any(String), [text, 24]);
    expect(body.suggestions).toEqual([
      { label: `${number} Hukanui Road`, kind: "street", context: "Chartwell", point: null },
    ]);
  });

  it("answers 500 without leaking the database error", async () => {
    query.mockRejectedValue(new Error('function walkreach_suggest does not exist'));
    const res = await get("huk");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Database query failed" });
  });
});
