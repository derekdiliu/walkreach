import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Imported afresh for every test so that no cached lookup, rate count or
// reserved Nominatim slot carries over.
let GET: typeof import("@/app/api/geocode/route").GET;

const fetchMock = vi.fn();

const get = (q: string) =>
  GET(new NextRequest(`http://localhost/api/geocode?q=${encodeURIComponent(q)}`));

const place = (display_name: string, lon = "175.28", lat = "-37.78") => ({
  display_name,
  lon,
  lat,
});

beforeEach(async () => {
  vi.resetModules();
  ({ GET } = await import("@/app/api/geocode/route"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GET /api/geocode", () => {
  it.each(["", "ab", "  ab  "])("rejects %j as too short without calling Nominatim", async (q) => {
    const res = await get(q);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Nominatim for NZ results bounded to the routable Hamilton box", async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    await get("  Victoria Street ");

    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("Victoria Street");
    expect(params.get("countrycodes")).toBe("nz");
    expect(params.get("viewbox")).toBe("175.16,-37.86,175.37,-37.68");
    expect(params.get("bounded")).toBe("1");
    // Nominatim's usage policy: identify the application.
    expect(init.headers["User-Agent"]).toMatch(/^WalkReach\//);
  });

  it("shortens labels to three parts and parses coordinates as numbers", async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        place("University of Waikato, Gate 1 Knighton Road, Hillcrest, Hamilton, Waikato, 3216, New Zealand / Aotearoa", "175.3155", "-37.7870"),
      ]),
    );
    const body = await (await get("waikato uni")).json();
    expect(body).toEqual({
      results: [
        { lng: 175.3155, lat: -37.787, label: "University of Waikato, Gate 1 Knighton Road, Hillcrest" },
      ],
    });
  });

  it("drops a repeated label, keeping the first", async () => {
    // A long street is several OSM ways and comes back once per way.
    fetchMock.mockResolvedValue(
      Response.json([
        place("Grey Street, Hamilton East, Hamilton, Waikato", "175.29", "-37.79"),
        place("Grey Street, Hamilton East, Hamilton, Waikato", "175.30", "-37.80"),
        place("Grey Street, Claudelands, Hamilton, Waikato", "175.31", "-37.78"),
      ]),
    );
    const { results } = await (await get("grey street")).json();
    expect(results.map((r: { label: string }) => r.label)).toEqual([
      "Grey Street, Hamilton East, Hamilton",
      "Grey Street, Claudelands, Hamilton",
    ]);
    expect(results[0].lng).toBe(175.29);
  });

  it("answers 502 when Nominatim returns an error status", async () => {
    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    const res = await get("victoria street");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Address lookup failed" });
  });

  it("answers 502 when Nominatim cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await get("victoria street")).status).toBe(502);
  });

  it("answers a repeated query from its cache, whatever the case", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json([place("Grey Street, Hamilton East, Hamilton, Waikato")]),
    );
    const first = await (await get("grey street")).json();
    const second = await (await get("  Grey Street ")).json();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not cache a failed lookup", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await get("victoria street")).status).toBe(502);
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => Response.json([]));
    const next = get("victoria street");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await next).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks Nominatim at most once a second, however many ask at once", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => Response.json([]));
    const both = [get("grey street"), get("victoria street")];
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await Promise.all(both)).map((r) => r.status)).toEqual([200, 200]);
  });

  it("turns a lookup away with 503 rather than queue it past 5 s", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => Response.json([]));
    // Slots at 0 to 5 s; the seventh would wait 6 s.
    const lookups = Array.from({ length: 7 }, (_, i) => get(`street ${i}`));
    await vi.advanceTimersByTimeAsync(5000);
    const statuses = (await Promise.all(lookups)).map((r) => r.status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 503]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
