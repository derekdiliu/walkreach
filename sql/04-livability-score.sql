-- SUPERSEDED by walkreach_analysis() in 03-walkreach-analysis.sql, together
-- with get_isochrone() at the end of this file. Nothing in the app calls
-- either. It is kept, and rebuilt by 00-import.sh, only so the
-- report can show the before/after: this version spatially joins amenities to
-- reached nodes on every request (~6 s), where walkreach_analysis joins the
-- precomputed amenity_nodes table (~0.4-2 s).
--
-- The two no longer agree on the score. This one measures to a polygon's
-- centroid; walkreach_analysis measures to its footprint, which is the point
-- of that change. At the CBD test coordinate it gives 81.6 against 85.0, and
-- every category differs. So the pair now shows two changes at once, and it
-- cannot be presented as a like-for-like timing comparison. Isolating the
-- speedup would mean giving this function the same footprint rule - at which
-- point it stops being a record of what the code used to do. Left as the
-- historical version deliberately; the report should say which of the two
-- comparisons it is making.
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

-- Also SUPERSEDED, and kept for the same reason: livability_score() and this
-- were the pair walkreach_analysis() replaced, each running its own network
-- traversal, and scripts/perf.mts times that pair as the "before". This one
-- was only ever created by hand in the development database, so a database
-- built from these files lacked it and the timing script failed; it is
-- recorded here as it was, recovered with pg_get_functiondef.
CREATE OR REPLACE FUNCTION get_isochrone(input_lng float, input_lat float)
RETURNS TABLE(minutes integer, geojson text) AS $$
  WITH start AS (
    SELECT id FROM ways_vertices_pgr
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326)
    LIMIT 1
  ),
  reach AS (
    SELECT dd.agg_cost,
      CASE WHEN dd.agg_cost <= 417 THEN 5
           WHEN dd.agg_cost <= 833 THEN 10 ELSE 15 END AS minutes,
      v.geom
    FROM start, pgr_drivingDistance(
      'SELECT id, source, target, length_m AS cost FROM ways',
      (SELECT id FROM start), 1250, false
    ) dd
    JOIN ways_vertices_pgr v ON dd.node = v.id
  )
  SELECT m AS minutes,
    ST_AsGeoJSON(ST_ConcaveHull(ST_Collect(geom), 0.8)) AS geojson
  FROM reach, (VALUES (5),(10),(15)) AS t(m)
  WHERE reach.agg_cost <= (m::float / 15.0 * 1250.0)
  GROUP BY m;
$$ LANGUAGE sql;
