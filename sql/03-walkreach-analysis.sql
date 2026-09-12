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
    -- Hulled in NZTM (2193) so the smoothing distances below are metres.
    SELECT m AS minutes,
      ST_ConcaveHull(ST_Collect(ST_Transform(iso.geom, 2193)), 0.8) AS geom
    FROM iso, (VALUES (5),(10),(15)) AS t(m)
    WHERE iso.agg_cost <= (m::float / 15.0 * 1250.0)
    GROUP BY m
  ),
  smoothed AS (
    -- The hull is drawn through the reachable vertices themselves, so it
    -- arrives spiky: a slit wherever one street runs on past its neighbours,
    -- a hole wherever a block holds no vertex at all. Shave the slits off
    -- (erode 40 m, dilate back) and fill the holes in (dilate 55 m, erode
    -- back) -- the two dilations compose, hence the 95. 55 m closes a hole
    -- up to a 110 m block; 40 m is the widest slit worth calling an artefact
    -- rather than a real dead end. Then drop the vertex jitter the buffering
    -- leaves behind and round off what corners remain.
    SELECT minutes,
      ST_ChaikinSmoothing(
        ST_SimplifyPreserveTopology(
          ST_Buffer(ST_Buffer(ST_Buffer(geom, -40), 95), -55),
          5
        ),
        2
      ) AS geom
    FROM bands
  ),
  nested AS (
    -- Smoothing moves each band's edge on its own, so a shorter walk can end
    -- up poking outside a longer one. Re-establish the containment before
    -- cutting the rings, or they would overlap again.
    SELECT minutes, ST_Union(geom) OVER (ORDER BY minutes) AS geom
    FROM smoothed
  ),
  ringed AS (
    -- Each band is only the area it adds over the next-shorter walk. The
    -- hulls are nested, so emitting them whole would stack three translucent
    -- fills over the centre and every band would render as the same blend.
    SELECT minutes,
      COALESCE(ST_Difference(geom, LAG(geom) OVER (ORDER BY minutes)), geom)
        AS geom
    FROM nested
  ),
  repaired AS (
    -- Reprojecting into degrees can pinch a smoothed edge into a self-touch.
    -- ST_MakeValid repairs that, but it repairs by splitting, and some of
    -- what it splits off is hairline.
    SELECT minutes,
      ST_CollectionExtract(ST_MakeValid(ST_Transform(geom, 4326)), 3) AS geom
    FROM ringed
  ),
  rings AS (
    -- Two last passes, and both have to come after ST_MakeValid rather than
    -- before it. The sliver filter, because the hairlines are what MakeValid
    -- split off, not what went into it -- and it tests width, not area, since
    -- 200 m of hairline half a metre wide still measures 100 m2. The rounding,
    -- because ST_AsGeoJSON rounds too, and rounding a smoothed edge can fold
    -- it into a self-touch after every check above has passed; doing it here
    -- with ST_ReducePrecision guarantees a valid result at the same 1e-7
    -- (about a centimetre) the 7 dp below then writes out.
    SELECT minutes, ST_ReducePrecision(ST_Collect(part.geom), 1e-7) AS geom
    FROM repaired, LATERAL ST_Dump(repaired.geom) AS part
    WHERE NOT ST_IsEmpty(ST_Buffer(ST_Transform(part.geom, 2193), -1.5))
    GROUP BY minutes
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
          'geometry', ST_AsGeoJSON(geom, 7)::jsonb
        ) ORDER BY minutes DESC)
        FROM rings
        -- a start node with nothing reachable hulls down to a point/line
        WHERE ST_GeometryType(geom) IN ('ST_Polygon', 'ST_MultiPolygon')
          AND NOT ST_IsEmpty(geom)
      ), '[]'::jsonb)
    )
  );
$$ LANGUAGE sql;
