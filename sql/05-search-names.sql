-- The names the address search suggests while you type. Nominatim's usage
-- policy rules out a lookup per keystroke, so the suggestions come from here
-- instead, and Nominatim is still asked only once a suggestion is picked.
-- Needs places_points (00-import.sh), ways and amenities (01-amenities.sql).
-- Rebuild whenever any of them is reimported.
--
-- The kinds of name:
--   place   suburbs and localities, which come with a point to go straight to
--   street  every distinct street or path name on the network; a street runs
--           for kilometres, so it has no point and is resolved by Nominatim
--   supermarket, clinic, school, park
--           named amenities, with their point. Bus stops are left out: most
--           are named after the address they stand at ("126 Crosby Rd") and
--           would crowd out the street itself.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

DROP TABLE IF EXISTS search_names;
CREATE TABLE search_names (
  name text NOT NULL,
  kind text NOT NULL,              -- place, street, or the amenity category
  context text,                    -- the nearest suburb, shown beside the name
  geom geometry(Point, 4326),      -- NULL for streets
  search text                      -- name lower-cased with macrons removed
);

-- "Saint Andrews" and "St Andrews" are both mapped; each is kept, since
-- either is what someone might type.
INSERT INTO search_names (name, kind, geom)
SELECT DISTINCT ON (name) name, 'place', geom
FROM places_points
WHERE name IS NOT NULL
ORDER BY name, ogc_fid;

-- The suburb whose point is nearest, to tell apart two things with one name.
CREATE FUNCTION pg_temp.suburb_near(g geometry) RETURNS text AS $$
  SELECT name FROM search_names WHERE kind = 'place'
  ORDER BY geom <-> g LIMIT 1
$$ LANGUAGE sql STABLE;

INSERT INTO search_names (name, kind, context)
SELECT name, 'street', pg_temp.suburb_near(ST_Centroid(ST_Collect(geom)))
FROM ways
WHERE name IS NOT NULL AND main_network
GROUP BY name;

-- Eight Woolworths, so each carries its suburb; one row per name and suburb.
INSERT INTO search_names (name, kind, context, geom)
SELECT DISTINCT ON (name, suburb) name, category, suburb, geom
FROM (
  SELECT name, category, geom, pg_temp.suburb_near(geom) AS suburb, id
  FROM amenities
  WHERE name IS NOT NULL AND category <> 'bus_stop'
) a
ORDER BY name, suburb, id;

UPDATE search_names SET search = lower(unaccent(name));
ANALYZE search_names;
