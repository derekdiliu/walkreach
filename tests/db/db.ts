import { Pool } from "pg";

// These tests run against the real PostGIS database (docker compose up -d),
// because the scoring and the isochrones are computed in SQL, not in the app.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type Point = { lng: number; lat: number };

export type Breakdown = {
  category: string;
  weighted_score: number;
  max_score: number;
  nearest_m: number | null;
  nearest_name: string | null;
};

export type Analysis = {
  total_score: number;
  breakdown: Breakdown[];
  isochrone: {
    type: "FeatureCollection";
    features: { properties: { minutes: number }; geometry: unknown }[];
  };
};

export async function analyse({ lng, lat }: Point): Promise<Analysis> {
  const { rows } = await pool.query(
    "SELECT walkreach_analysis($1, $2) AS a",
    [lng, lat],
  );
  return rows[0].a;
}

// The band (5, 10 or 15) of from's isochrone that covers to, or null when to
// is outside all of them. Checked in PostGIS against the GeoJSON the API
// serves, so what is tested is exactly what the map draws.
export async function bandCovering(from: Point, to: Point): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT min((f->'properties'->>'minutes')::int) AS minutes
     FROM jsonb_array_elements(walkreach_analysis($1, $2)->'isochrone'->'features') f
     WHERE ST_Intersects(
       ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry'), 4326),
       ST_SetSRID(ST_MakePoint($3, $4), 4326))`,
    [from.lng, from.lat, to.lng, to.lat],
  );
  return rows[0].minutes;
}

export async function straightLineM(a: Point, b: Point): Promise<number> {
  const { rows } = await pool.query(
    "SELECT ST_Distance(ST_MakePoint($1, $2)::geography, ST_MakePoint($3, $4)::geography) AS m",
    [a.lng, a.lat, b.lng, b.lat],
  );
  return rows[0].m;
}

// Walking distance between the network nodes nearest each point, the same
// snapping walkreach_analysis does. null when no path exists at all.
export async function networkM(a: Point, b: Point): Promise<number | null> {
  const { rows } = await pool.query(
    `WITH s AS (SELECT id FROM ways_vertices_pgr
                ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) LIMIT 1),
          t AS (SELECT id FROM ways_vertices_pgr
                ORDER BY geom <-> ST_SetSRID(ST_MakePoint($3, $4), 4326) LIMIT 1)
     SELECT (SELECT agg_cost FROM pgr_dijkstraCost(
       'SELECT id, source, target, length_m AS cost FROM ways',
       (SELECT id FROM s), (SELECT id FROM t), false)) AS m`,
    [a.lng, a.lat, b.lng, b.lat],
  );
  return rows[0].m;
}
