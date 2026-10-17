import type { Breakdown, Reached } from "@/app/_lib/walkreach";

// The SQL measures every walk from the network vertex nearest the point,
// because analyses are cached per vertex. The walk really starts at the
// point, so start_m - the straight stretch from the point to that vertex -
// is added here, after the cache, by both the analysis and the route, so the
// two always agree on a distance.

// 15 minutes at 1.4 m/s: the furthest a walk counts, and where the score
// for a category reaches 0, as in walkreach_analysis.
const MAX_WALK_M = 1250;

const round1 = (x: number) => Math.round(x * 10) / 10;

// The walk from the point, or null once start_m takes it past 15 minutes.
export function fromPoint(walk_m: number, start_m: number): number | null {
  const m = Math.round(walk_m + start_m);
  return m <= MAX_WALK_M ? m : null;
}

// The analysis of a vertex, as walked from a point start_m away from it:
// every distance longer, anything pushed past 15 minutes dropped, and each
// category rescored on the same linear decay the SQL uses.
export function analysisFromPoint<A extends { breakdown: Breakdown[]; amenities: Reached[] }>(
  analysis: A,
  start_m: number,
): A & { total_score: number } {
  const amenities = analysis.amenities.flatMap((a) => {
    const walk_m = fromPoint(a.walk_m, start_m);
    return walk_m === null ? [] : [{ ...a, walk_m }];
  });

  const breakdown = analysis.breakdown.map((b) => {
    const nearest_m = b.nearest_m === null ? null : fromPoint(b.nearest_m, start_m);
    if (nearest_m === null) return { ...b, weighted_score: 0, nearest_m: null, nearest_name: null };
    return {
      ...b,
      nearest_m,
      weighted_score: round1(Math.max(0, 1 - nearest_m / MAX_WALK_M) * b.max_score),
    };
  });

  const total_score = round1(breakdown.reduce((sum, b) => sum + b.weighted_score, 0));
  return { ...analysis, total_score, breakdown, amenities };
}
