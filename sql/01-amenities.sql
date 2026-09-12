-- Clean, categorised amenities table from the raw ogr2ogr imports.
-- Run after 00-import.sh has loaded amenities_points / amenities_polygons.
CREATE EXTENSION IF NOT EXISTS hstore;

DROP TABLE IF EXISTS amenities;
CREATE TABLE amenities (
  id serial PRIMARY KEY,
  category text NOT NULL,
  name text,
  geom geometry(Point, 4326)
);

-- Point amenities: ogr2ogr gives this layer only (ogc_fid, other_tags, geom),
-- so every tag has to come out of the other_tags hstore.
INSERT INTO amenities (category, name, geom)
SELECT
  CASE
    WHEN t->'shop' = 'supermarket' THEN 'supermarket'
    WHEN t->'amenity' IN ('clinic','doctors','pharmacy','hospital') THEN 'clinic'
    WHEN t->'amenity' IN ('school','kindergarten') THEN 'school'
    WHEN t->'leisure' = 'park' THEN 'park'
    WHEN t->'highway' = 'bus_stop' OR t->'public_transport' = 'platform' THEN 'bus_stop'
  END,
  t->'name', geom
FROM (SELECT hstore(other_tags) AS t, geom FROM amenities_points) s
WHERE t->'shop' = 'supermarket'
   OR t->'amenity' IN ('clinic','doctors','pharmacy','hospital','school','kindergarten')
   OR t->'leisure' = 'park'
   OR t->'highway' = 'bus_stop'
   OR t->'public_transport' = 'platform';

-- Polygon amenities: ogr2ogr promotes common tags to their OWN columns on this
-- layer (name, amenity, leisure, shop, ...), so read the columns, not other_tags.
-- Polygons become centroids. No bus_stop here - stops are always points.
INSERT INTO amenities (category, name, geom)
SELECT
  CASE
    WHEN shop = 'supermarket' THEN 'supermarket'
    WHEN amenity IN ('clinic','doctors','pharmacy','hospital') THEN 'clinic'
    WHEN amenity IN ('school','kindergarten') THEN 'school'
    WHEN leisure = 'park' THEN 'park'
  END,
  name, ST_Centroid(geom)
FROM amenities_polygons
WHERE shop = 'supermarket'
   OR amenity IN ('clinic','doctors','pharmacy','hospital','school','kindergarten')
   OR leisure = 'park';

CREATE INDEX amenities_geom_idx ON amenities USING GIST (geom);
CREATE INDEX amenities_category_idx ON amenities (category);
