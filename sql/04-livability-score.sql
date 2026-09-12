-- SUPERSEDED by walkreach_analysis() in 03-walkreach-analysis.sql. Nothing in
-- the app calls this. It is kept, and rebuilt by 00-import.sh, only so the
-- report can show the before/after: this version spatially joins amenities to
-- reached nodes on every request (~6 s), where walkreach_analysis joins the
-- precomputed amenity_nodes table (~0.4-2 s) for identical scores.
CREATE OR REPLACE FUNCTION livability_score(input_lng float, input_lat float)
RETURNS TABLE(category text, weighted_score numeric) AS $$
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
  reached AS (
    -- 每个设施找到它最快的可达距离（米）
    SELECT a.category, a.id,
      MIN(iso.agg_cost) AS dist_m
    FROM amenities a
    JOIN iso ON ST_DWithin(a.geom::geography, iso.geom::geography, 50)
    GROUP BY a.category, a.id
  ),
  nearest AS (
    -- 每类只取最近的那个设施
    SELECT category, MIN(dist_m) AS nearest_m
    FROM reached GROUP BY category
  )
  SELECT category,
    round((
      -- 最近设施距离转成 0-1 分：0米=1.0, 1250米=0.0，线性衰减
      GREATEST(0, 1 - nearest_m / 1250.0) *
      CASE category
        WHEN 'supermarket' THEN 0.30 WHEN 'clinic' THEN 0.25
        WHEN 'school' THEN 0.20 WHEN 'park' THEN 0.15
        WHEN 'bus_stop' THEN 0.10 END * 100
    )::numeric, 1)
  FROM nearest;
$$ LANGUAGE sql;
