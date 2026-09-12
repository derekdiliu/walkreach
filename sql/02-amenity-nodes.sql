-- Amenity -> network node pairs, precomputed. The scoring query used to
-- spatially join every amenity against every reached node on each request
-- (~6 s); this turns that into an equality join on node id.
-- Rebuild whenever the amenities or ways tables are reimported (~80 s).
--
-- Polygon amenities match on their footprint (amenities.area), so a park is
-- attached to every node within 50 m of it and the walk is measured to
-- whichever part you approach - reaching any of it is reaching the park. Nodes
-- strictly inside the footprint match at 0 m, which is usually right (a path
-- through a park) but not always: a public road drawn through a hospital
-- campus makes that clinic read as 0 m from the road, whatever the entrance
-- actually is. Points match on themselves.
--
-- The two radii are not the same quantity. For a polygon, the boundary already
-- is the arrival edge, so 50 m is a real tolerance. For a point, the radius is
-- absorbing mapping error - a bus stop is tagged on the kerb, not on the
-- centreline the network follows - so it needs 100 m. Measured over 35 sampled
-- points, splitting them beats either single radius on every category.
--
-- The polygon radius dropping from 100 m to 50 m does cost coverage: 3 small
-- parks that used to match a node within 100 m of their centroid have nothing
-- within 50 m of their footprint, and now score as unreachable.
DROP TABLE IF EXISTS amenity_nodes;
CREATE TABLE amenity_nodes AS
SELECT a.id AS amenity_id, a.category, v.id AS node_id
FROM amenities a
JOIN ways_vertices_pgr v
  ON ST_DWithin(COALESCE(a.area::geometry, a.geom::geometry)::geography,
                v.geom::geography,
                CASE WHEN a.area IS NULL THEN 100 ELSE 50 END);
ALTER TABLE amenity_nodes ADD PRIMARY KEY (amenity_id, node_id);
CREATE INDEX amenity_nodes_node_idx ON amenity_nodes (node_id);
ANALYZE amenity_nodes;
