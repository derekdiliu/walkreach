-- One network traversal per query: pgr_drivingDistance runs once and both the
-- amenity scoring and the isochrone bands are derived from its result.
-- Replaces livability_score() + get_isochrone(), which each ran their own.
-- Needs the amenity_nodes table from 01-amenity-nodes.sql.

CREATE OR REPLACE FUNCTION walkreach_analysis(input_lng float, input_lat float)
RETURNS jsonb AS $$
  WITH start AS (
    SELECT id FROM ways_vertices_pgr
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326)
    LIMIT 1
  ),
  iso AS (
    SELECT dd.node, dd.agg_cost, v.geom
    FROM start, pgr_drivingDistance(
      'SELECT id, source, target, length_m AS cost FROM ways',
      (SELECT id FROM start), 1250, false
    ) dd
    JOIN ways_vertices_pgr v ON dd.node = v.id
  ),
  weights (category, weight) AS (
    VALUES ('supermarket', 0.30), ('clinic', 0.25), ('school', 0.20),
           ('park', 0.15), ('bus_stop', 0.10)
  ),
  nearest AS (
    -- 每类设施取最近的那一个（米）
    SELECT an.category, MIN(iso.agg_cost) AS nearest_m
    FROM amenity_nodes an
    JOIN iso ON iso.node = an.node_id
    GROUP BY an.category
  ),
  scored AS (
    -- 最近设施距离转成 0-1 分：0米=1.0, 1250米=0.0，线性衰减。
    -- 每类都输出一行，走不到的那类是 0 分（而不是从结果里消失）。
    SELECT w.category,
      round((
        GREATEST(0, 1 - COALESCE(n.nearest_m, 1250) / 1250.0) * w.weight * 100
      )::numeric, 1) AS weighted_score,
      round((w.weight * 100)::numeric, 1) AS max_score,
      round(n.nearest_m::numeric) AS nearest_m
    FROM weights w
    LEFT JOIN nearest n ON n.category = w.category
  ),
  bands AS (
    SELECT m AS minutes,
      ST_ConcaveHull(ST_Collect(iso.geom), 0.8) AS geom
    FROM iso, (VALUES (5),(10),(15)) AS t(m)
    WHERE iso.agg_cost <= (m::float / 15.0 * 1250.0)
    GROUP BY m
  )
  SELECT jsonb_build_object(
    'total_score', COALESCE((SELECT round(sum(weighted_score), 1) FROM scored), 0),
    'breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category', category, 'weighted_score', weighted_score,
        'max_score', max_score, 'nearest_m', nearest_m
      ) ORDER BY category) FROM scored), '[]'::jsonb),
    'isochrone', jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object('minutes', minutes),
          'geometry', ST_AsGeoJSON(geom)::jsonb
        ) ORDER BY minutes DESC)
        FROM bands
        -- a start node with nothing reachable hulls down to a point/line
        WHERE ST_GeometryType(geom) IN ('ST_Polygon', 'ST_MultiPolygon')
      ), '[]'::jsonb)
    )
  );
$$ LANGUAGE sql;
