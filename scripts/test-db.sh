#!/bin/sh
# Builds a database for the db tests without the OSM tooling or the 380 MB
# extract: the tables osm2pgrouting and ogr2ogr produce come from a dump, and
# everything derived from them - amenities, amenity_nodes, search_names and
# every function - is built from sql/ as it stands in this checkout, so the
# tests check that SQL.
# CI runs it; so can you, against the walkreach-db container:
#
#   gh release download test-data --pattern 'walkreach-test.dump'
#   ./scripts/test-db.sh walkreach-test.dump
#   DATABASE_URL=postgresql://walkreach:walkreach@localhost:5433/walkreach_test npm run test:db
#
# The dump is remade after a reimport with:
#
#   docker exec walkreach-db pg_dump -U walkreach -d walkreach -Fc -Z9 --no-owner \
#     -t ways -t ways_vertices_pgr -t configuration -t places_points \
#     -t amenities_points -t amenities_polygons \
#     > walkreach-test.dump
#   gh release upload test-data walkreach-test.dump --clobber
set -e
cd "$(dirname "$0")/.."

DUMP="${1:?usage: scripts/test-db.sh <dump> [database]}"
DB="${2:-walkreach_test}"
PSQL="docker exec -i -e PGOPTIONS=--client-min-messages=warning walkreach-db psql -U walkreach -q -v ON_ERROR_STOP=1"

$PSQL -d walkreach -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
$PSQL -d "$DB" -c "CREATE EXTENSION postgis" -c "CREATE EXTENSION pgrouting"
docker exec -i walkreach-db pg_restore -U walkreach -d "$DB" --no-owner < "$DUMP"

for f in 01-amenities 02-amenity-nodes 03-walkreach-analysis 05-search-names 06-walkreach-suggest; do
  echo "==> $f.sql"
  $PSQL -d "$DB" < "sql/$f.sql"
done
