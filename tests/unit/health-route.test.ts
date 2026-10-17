import { beforeEach, describe, expect, it, vi } from "vitest";

// As in livability-route.test.ts: pg is swapped out before the route builds
// its Pool, and each test scripts the one query.
const query = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = query;
  },
}));

const { GET } = await import("@/app/api/health/route");

beforeEach(() => {
  query.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/health", () => {
  it("answers ok once the database does", async () => {
    query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("answers 503 when the database does not", async () => {
    query.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", error: "Database unreachable" });
  });
});
