#!/usr/bin/env bash
# WalkReach - full data import, reproducible from scratch.
# Rebuilds everything the app needs: the pedestrian network (ways /
# ways_vertices_pgr), the amenities table, the precomputed amenity_nodes pairs
# and the SQL functions.
#
# Prereqs:
#   - docker compose up -d   (PostGIS + pgRouting on port 5433)
#   - osmium, osm2pgrouting, ogr2ogr (GDAL) installed locally
#   - a New Zealand .osm.pbf extract downloaded into ../../data
#
# The data/ directory lives OUTSIDE this repo (walkreach/data, not
# walkreach/app/data) because the extracts are 380 MB+ and are not committed.
set -euo pipefail

# ---- config ----
DATA_DIR="$(cd "$(dirname "$0")/../../data" && pwd)"
NZ_PBF="$DATA_DIR/new-zealand-260725.osm.pbf"   # whatever Geofabrik extract you downloaded
BBOX="175.20,-37.85,175.32,-37.73"              # Hamilton
PG_HOST="localhost"; PG_PORT="5433"
PG_DB="walkreach"; PG_USER="walkreach"; PG_PASS="walkreach"
PGURI="postgresql://$PG_USER:$PG_PASS@$PG_HOST:$PG_PORT/$PG_DB"
# brew upgrades move this - check with:
#   find /opt/homebrew -name mapconfig_for_pedestrian.xml
PEDCONF="/opt/homebrew/Cellar/osm2pgrouting/3.0.0_2/share/osm2pgrouting/mapconfig_for_pedestrian.xml"

SQL_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_CONTAINER="walkreach-db"

# osmium/osm2pgrouting/ogr2ogr talk to the DB over TCP, but psql may not be
# installed locally (it ships with the Postgres client, not with GDAL), so fall
# back to the psql inside the container and feed it the file on stdin.
if command -v psql >/dev/null 2>&1; then
  run_sql_file() { psql "$PGURI" -v ON_ERROR_STOP=1 -f "$1"; }
  run_sql()      { psql "$PGURI" "$@"; }
else
  echo "note: no local psql, using the one inside $DB_CONTAINER"
  run_sql_file() { docker exec -i "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 < "$1"; }
  run_sql()      { docker exec -i "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" "$@"; }
fi

echo "==> 1/8  Clip Hamilton from the NZ extract"
osmium extract --bbox "$BBOX" --set-bounds -o "$DATA_DIR/hamilton.osm.pbf" "$NZ_PBF" --overwrite

echo "==> 2/8  Convert PBF -> OSM XML (osm2pgrouting cannot read PBF)"
osmium cat "$DATA_DIR/hamilton.osm.pbf" -o "$DATA_DIR/hamilton.osm" --overwrite

echo "==> 3/8  Build the routable pedestrian network (ways / ways_vertices_pgr)"
osm2pgrouting \
  --f "$DATA_DIR/hamilton.osm" \
  --conf "$PEDCONF" \
  --dbname "$PG_DB" --username "$PG_USER" --password "$PG_PASS" \
  --host "$PG_HOST" --port "$PG_PORT" --clean

echo "==> 4/8  Filter amenities out of the Hamilton extract"
osmium tags-filter "$DATA_DIR/hamilton.osm.pbf" \
  nwr/shop=supermarket \
  nwr/amenity=clinic,doctors,pharmacy,hospital \
  nwr/amenity=school,kindergarten \
  nwr/leisure=park \
  nwr/highway=bus_stop \
  nwr/public_transport=platform \
  -o "$DATA_DIR/amenities.osm.pbf" --overwrite

echo "==> 5/8  Load raw amenity points + polygons into PostGIS"
ogr2ogr -f PostgreSQL "PG:$PGURI" "$DATA_DIR/amenities.osm.pbf" \
  -nln amenities_points -overwrite -lco GEOMETRY_NAME=geom -t_srs EPSG:4326 points
ogr2ogr -f PostgreSQL "PG:$PGURI" "$DATA_DIR/amenities.osm.pbf" \
  -nln amenities_polygons -overwrite -lco GEOMETRY_NAME=geom -t_srs EPSG:4326 multipolygons

echo "==> 6/8  Build the clean amenities table"
run_sql_file "$SQL_DIR/01-amenities.sql"

echo "==> 7/8  Precompute amenity -> node pairs (slow, several minutes)"
run_sql_file "$SQL_DIR/02-amenity-nodes.sql"

echo "==> 8/8  Create the analysis functions"
run_sql_file "$SQL_DIR/03-walkreach-analysis.sql"
run_sql_file "$SQL_DIR/04-livability-score.sql"

echo
echo "==> Done. Sanity check - compare against the known-good baseline:"
echo "    bus_stop 1060 | park 201 | school 141 | clinic 79 | supermarket 25"
run_sql -c "SELECT category, count(*) FROM amenities GROUP BY category ORDER BY count(*) DESC;"
echo "    ways ~37500, ways_vertices_pgr ~30000, amenity_nodes ~10100"
run_sql -c "SELECT
  (SELECT count(*) FROM ways) AS ways,
  (SELECT count(*) FROM ways_vertices_pgr) AS vertices,
  (SELECT count(*) FROM amenity_nodes) AS amenity_nodes;"
echo "    CBD should score 81.6:"
run_sql -tAc "SELECT walkreach_analysis(175.2793, -37.7871)->'total_score';"
