import { afterAll, describe, expect, it } from "vitest";
import { analyse, pool, type Point } from "./db";

afterAll(() => pool.end());

const WEIGHTS: Record<string, number> = {
  bus_stop: 0.1,
  clinic: 0.25,
  park: 0.15,
  school: 0.2,
  supermarket: 0.3,
};

const CBD: Point = { lng: 175.2793, lat: -37.7871 };
const CBD_EDGE: Point = { lng: 175.283, lat: -37.787 };

const SAMPLES: Record<string, Point> = {
  cbd: CBD,
  "cbd edge": CBD_EDGE,
  "north-west": { lng: 175.2570103, lat: -37.7376565 },
  "hamilton east": { lng: 175.308185, lat: -37.7857515 },
  south: { lng: 175.2749877, lat: -37.8053868 },
  "outer west": { lng: 175.2004994, lat: -37.7684889 },
  "far south-west": { lng: 175.1703684, lat: -37.8321035 },
};

describe.each(Object.entries(SAMPLES))("score at %s", (_, point) => {
  it("reports every category, even one out of reach, with its weight as max", async () => {
    const { breakdown } = await analyse(point);
    expect(breakdown.map((b) => b.category)).toEqual(Object.keys(WEIGHTS));
    for (const b of breakdown) expect(b.max_score).toBe(WEIGHTS[b.category] * 100);
  });

  it("keeps each category between 0 and its max", async () => {
    for (const b of (await analyse(point)).breakdown) {
      expect(b.weighted_score).toBeGreaterThanOrEqual(0);
      expect(b.weighted_score).toBeLessThanOrEqual(b.max_score);
    }
  });

  it("totals the categories", async () => {
    const { total_score, breakdown } = await analyse(point);
    const sum = breakdown.reduce((s, b) => s + b.weighted_score, 0);
    expect(total_score).toBeCloseTo(sum, 5);
    expect(total_score).toBeLessThanOrEqual(100);
  });

  it("decays linearly with walking distance to the nearest, to 0 at 1250 m", async () => {
    for (const b of (await analyse(point)).breakdown) {
      if (b.nearest_m === null) {
        // Nothing of this kind within 15 minutes.
        expect(b.weighted_score).toBe(0);
        expect(b.nearest_name).toBeNull();
        continue;
      }
      expect(b.nearest_m).toBeGreaterThanOrEqual(0);
      expect(b.nearest_m).toBeLessThanOrEqual(1250);
      // nearest_m is rounded to the metre and the score to 0.1.
      const expected = b.max_score * (1 - b.nearest_m / 1250);
      expect(Math.abs(b.weighted_score - expected)).toBeLessThanOrEqual(0.06);
    }
  });
});

describe("score across the city", () => {
  it("ranks the CBD above its edge", async () => {
    const [cbd, edge] = await Promise.all([analyse(CBD), analyse(CBD_EDGE)]);
    expect(cbd.total_score).toBeGreaterThan(edge.total_score);
  });

  it("scores the city centre as walkable and the rural fringe as car-dependent", async () => {
    expect((await analyse(CBD)).total_score).toBeGreaterThanOrEqual(60);
    expect((await analyse(SAMPLES["far south-west"])).total_score).toBeLessThan(20);
  });

  // Pinned from the current data and function. A change here means the
  // score moved: update these deliberately, and say why in the commit, after
  // reimporting data or changing the scoring.
  it.each([
    ["cbd", 80.3],
    ["cbd edge", 65.7],
    ["north-west", 78.0],
    ["hamilton east", 31.3],
    ["south", 41.0],
    ["outer west", 5.3],
    ["far south-west", 0],
  ])("still scores %s at %d", async (name, score) => {
    expect((await analyse(SAMPLES[name])).total_score).toBe(score);
  });
});
