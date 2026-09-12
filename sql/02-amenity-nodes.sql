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
