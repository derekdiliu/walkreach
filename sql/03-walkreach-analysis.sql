-- One network traversal per query: pgr_drivingDistance runs once and both the
-- amenity scoring and the isochrone bands are derived from its result.
-- Replaces livability_score() + get_isochrone(), which each ran their own.
-- Needs the amenity_nodes table from 01-amenity-nodes.sql.

-- The walking network is its largest connected component. The rest - 1.8%
-- of the city by area - is fragments of a few vertices joined to nothing
-- else: a path drawn in a field, a vertex left over at a junction. A walk
-- started on one reaches an amenity or two and nowhere else, so it scored
-- without a single band to show for it. Flag the main component on both
-- tables so the start can be restricted to it. Recomputed on every run, since
-- osm2pgrouting --clean rebuilds both tables.
ALTER TABLE ways_vertices_pgr ADD COLUMN IF NOT EXISTS main_network boolean;
ALTER TABLE ways ADD COLUMN IF NOT EXISTS main_network boolean;

WITH cc AS (
  SELECT node, component FROM pgr_connectedComponents(
    'SELECT id, source, target, length_m AS cost, length_m AS reverse_cost FROM ways')
),
main AS (
  SELECT component FROM cc GROUP BY component ORDER BY count(*) DESC LIMIT 1
)
UPDATE ways_vertices_pgr v
SET main_network = (cc.component = (SELECT component FROM main))
FROM cc WHERE cc.node = v.id;

UPDATE ways w SET main_network = v.main_network
FROM ways_vertices_pgr v WHERE v.id = w.source;

ANALYZE ways_vertices_pgr;
ANALYZE ways;

-- The network vertex a walk from (lng, lat) starts at, or NULL when the point
-- is off the network. Shared by walkreach_analysis and walkreach_route, so the
-- route to an amenity starts where the distance to it was measured from.
CREATE OR REPLACE FUNCTION walkreach_start(input_lng float, input_lat float)
RETURNS bigint AS $$
  -- The nearest vertex is found however far away it is, so a point out in
  -- the farmland past the clip would be scored from wherever the network
  -- happens to end. More than 200 m from any walkable way counts as off the
  -- network: no start, nothing reached, a score of 0. Measured to the way
  -- rather than the vertex, because a long rural edge can leave a point on
  -- the road itself over a kilometre from either end. Both the way and the
  -- vertex must be on the main network: a fragment next to the point does
  -- not make it reachable.
  SELECT id FROM ways_vertices_pgr
  WHERE main_network AND (
    SELECT ST_Distance(geom::geography,
      ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326)::geography)
    FROM ways
    WHERE main_network
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326)
    LIMIT 1
  ) <= 200
  ORDER BY geom <-> ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326)
  LIMIT 1
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION walkreach_analysis(input_lng float, input_lat float)
RETURNS jsonb AS $$
  WITH start AS (
    SELECT id FROM (SELECT walkreach_start(input_lng, input_lat) AS id) s
    WHERE id IS NOT NULL
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
    -- 每类设施取最近的那一个（米），并带出它的名字，好让面板说出是哪一家。
    -- DISTINCT ON 而不是 MIN + GROUP BY：同一个查询里既要距离也要那一行的 name。
    SELECT DISTINCT ON (an.category)
      an.category, iso.agg_cost AS nearest_m, a.name
    FROM amenity_nodes an
    JOIN iso ON iso.node = an.node_id
    JOIN amenities a ON a.id = an.amenity_id
    ORDER BY an.category, iso.agg_cost
  ),
  reached AS (
    -- Every amenity within the walk, at the distance of whichever of its
    -- nodes is reached first: the list behind the counts, and what a route
    -- can be asked for.
    SELECT DISTINCT ON (an.amenity_id)
      an.amenity_id, an.category, a.name, iso.agg_cost
    FROM amenity_nodes an
    JOIN iso ON iso.node = an.node_id
    JOIN amenities a ON a.id = an.amenity_id
    ORDER BY an.amenity_id, iso.agg_cost
  ),
  scored AS (
    -- 最近设施距离转成 0-1 分：0米=1.0, 1250米=0.0，线性衰减。
    -- 每类都输出一行，走不到的那类是 0 分（而不是从结果里消失）。
    SELECT w.category,
      round((
        GREATEST(0, 1 - COALESCE(n.nearest_m, 1250) / 1250.0) * w.weight * 100
      )::numeric, 1) AS weighted_score,
      round((w.weight * 100)::numeric, 1) AS max_score,
      round(n.nearest_m::numeric) AS nearest_m,
      n.name AS nearest_name
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
        'max_score', max_score, 'nearest_m', nearest_m,
        'nearest_name', nearest_name
      ) ORDER BY category) FROM scored), '[]'::jsonb),
    'amenities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', amenity_id, 'category', category, 'name', name,
        'walk_m', round(agg_cost::numeric)
      ) ORDER BY agg_cost, amenity_id) FROM reached), '[]'::jsonb),
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

-- The walking route from (lng, lat) to one amenity, as walkreach_analysis
-- measured it: from the same start vertex, to whichever of the amenity's
-- nodes is closest along the network. NULL when the amenity is not within
-- the 1250 m walk.
--
-- A path of at most 1250 m cannot leave a 1250 m box around its start, so
-- the edges are cut to a box of 0.015 degrees each way (1,670 m north-south
-- and 1,320 m east-west at Hamilton's latitude) rather than handing Dijkstra
-- the whole city.
CREATE OR REPLACE FUNCTION walkreach_route(input_lng float, input_lat float,
                                           target_amenity int)
RETURNS jsonb AS $$
  WITH start AS (
    SELECT v.id, v.geom FROM ways_vertices_pgr v
    WHERE v.id = walkreach_start(input_lng, input_lat)
  ),
  targets AS (
    SELECT node_id FROM amenity_nodes WHERE amenity_id = target_amenity
  ),
  paths AS (
    SELECT p.* FROM start, pgr_dijkstra(
      format(
        'SELECT id, source, target, length_m AS cost FROM ways
         WHERE geom && ST_Expand(%L::geometry, 0.015)', start.geom),
      start.id, ARRAY(SELECT node_id FROM targets), false
    ) p
  ),
  best AS (
    -- The target the walk reaches first. The start being one of the
    -- amenity's own nodes is a walk of 0 m, which Dijkstra returns no path
    -- for, so it is taken separately.
    SELECT end_vid AS node, agg_cost AS walk_m FROM paths
    WHERE edge = -1 AND agg_cost <= 1250
    UNION ALL
    SELECT start.id, 0 FROM start JOIN targets ON targets.node_id = start.id
    ORDER BY walk_m, node
    LIMIT 1
  ),
  line AS (
    SELECT ST_LineMerge(ST_Collect(w.geom ORDER BY p.path_seq)) AS geom
    FROM paths p
    JOIN best ON p.end_vid = best.node
    JOIN ways w ON w.id = p.edge
  ),
  arrival AS (
    -- Where the walk arrives: the amenity's point, or for a park or a
    -- campus the edge of its footprint nearest the node the walk ends at.
    SELECT a.id, a.category, a.name, best.walk_m, v.geom AS node_geom,
      COALESCE(ST_ClosestPoint(a.area, v.geom), a.geom) AS geom
    FROM best
    JOIN ways_vertices_pgr v ON v.id = best.node
    JOIN amenities a ON a.id = target_amenity
  )
  SELECT jsonb_build_object(
    'amenity', jsonb_build_object(
      'id', arrival.id, 'category', arrival.category, 'name', arrival.name,
      'walk_m', round(arrival.walk_m::numeric)
    ),
    'destination', ST_AsGeoJSON(arrival.geom, 7)::jsonb,
    'route', COALESCE(ST_AsGeoJSON(line.geom, 7)::jsonb,
      jsonb_build_object('type', 'LineString', 'coordinates', '[]'::jsonb)),
    -- The two stretches the distance leaves out: from the point to the
    -- vertex the walk starts at, and from the node it ends at to the
    -- amenity. Drawn so the route visibly joins the pin to the amenity, and
    -- drawn apart from it because neither is in walk_m.
    'connectors', ST_AsGeoJSON(ST_Collect(
      ST_MakeLine(ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326),
                  start.geom),
      ST_MakeLine(arrival.node_geom, arrival.geom)
    ), 7)::jsonb
  )
  FROM arrival, start, line;
$$ LANGUAGE sql STABLE;
