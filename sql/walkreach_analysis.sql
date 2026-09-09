-- One network traversal per query: pgr_drivingDistance runs once and both the
-- amenity scoring and the isochrone bands are derived from its result.
-- Replaces livability_score() + get_isochrone(), which each ran their own.

-- Amenity -> network node pairs within 50 m, precomputed. The scoring query
-- used to spatially join every amenity against every reached node on each
-- request (~6 s); this turns that into an equality join on node id.
-- Rebuild whenever the amenities or ways tables are reimported.
DROP TABLE IF EXISTS amenity_nodes;
CREATE TABLE amenity_nodes AS
SELECT a.id AS amenity_id, a.category, v.id AS node_id
FROM amenities a
JOIN ways_vertices_pgr v ON ST_DWithin(a.geom::geography, v.geom::geography, 50);
ALTER TABLE amenity_nodes ADD PRIMARY KEY (amenity_id, node_id);
CREATE INDEX amenity_nodes_node_idx ON amenity_nodes (node_id);
ANALYZE amenity_nodes;

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
  nearest AS (
    -- 每类设施取最近的那一个（米）
    SELECT an.category, MIN(iso.agg_cost) AS nearest_m
    FROM amenity_nodes an
    JOIN iso ON iso.node = an.node_id
    GROUP BY an.category
  ),
  scored AS (
    -- 最近设施距离转成 0-1 分：0米=1.0, 1250米=0.0，线性衰减
    SELECT category,
      round((
        GREATEST(0, 1 - nearest_m / 1250.0) *
        CASE category
          WHEN 'supermarket' THEN 0.30 WHEN 'clinic' THEN 0.25
          WHEN 'school' THEN 0.20 WHEN 'park' THEN 0.15
          WHEN 'bus_stop' THEN 0.10 END * 100
      )::numeric, 1) AS weighted_score
    FROM nearest
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
        'category', category, 'weighted_score', weighted_score
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
