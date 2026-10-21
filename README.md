# WalkReach

[![Image](https://github.com/derekdiliu/walkreach/actions/workflows/image.yml/badge.svg)](https://github.com/derekdiliu/walkreach/actions/workflows/image.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live:** https://walkreach.australiaeast.cloudapp.azure.com · **Status:** v1.0,
stable. Map data from OpenStreetMap as of 25 July 2026.

![WalkReach: the 5, 10 and 15 minute walks from a point in central Hamilton, with its score and nearest amenities](docs/images/walkreach.png)

An interactive walkability tool for Hamilton, New Zealand. Search an address
or click anywhere on the map, and WalkReach shows you how far you can actually
walk in 5, 10 and 15 minutes — and how well that area is served by supermarkets, clinics, schools,
parks and bus stops.

The point is **network distance, not straight-line distance**. A supermarket
400 m away as the crow flies can be a 2 km walk if the Waikato River is in
between, and every "X minutes from the shops" claim that ignores this is
wrong. WalkReach routes over the real pedestrian network with pgRouting, so
the numbers reflect the walk you would actually take.

## What you get from one click

- **Three isochrone bands** — the area reachable on foot in 5 / 10 / 15 minutes,
  drawn as polygons over the map.
- **A livability score out of 100**, weighted across five amenity categories.
- **A per-category breakdown** — which supermarket, clinic, school, park and
  bus stop is nearest, how far each is in walking metres, and how many points
  that earned out of the category's maximum.
- **A side-by-side comparison** of two places — both walks on one map, both
  scores, and which of the two is closer for each category. The two points are
  kept in the URL (`?a=lng,lat&b=lng,lat`), so a comparison can be shared as a
  link.

![Comparing two places, then drawing the walk to a supermarket](docs/images/demo.gif)

## How it works

Walking speed is taken as 1.4 m/s, which turns the three time budgets into
distance budgets of 417 / 833 / 1250 m.

A single call to `walkreach_analysis(lng, lat)` does everything:

1. Snap the clicked coordinate to the nearest node in the pedestrian network.
2. Run **one** `pgr_drivingDistance` traversal out to the 1250 m budget.
3. Score amenities from that traversal — for each category, find the nearest
   reachable one and decay its distance linearly (0 m = full marks,
   1250 m or unreachable = zero), then weight it. A walk to an amenity is the
   network distance to one of its nodes plus the straight last stretch from
   that node to it, through whichever node makes the sum least. A park or
   school is matched against its whole footprint, so that stretch ends at the
   nearest part of it you could walk up to, not at a centroid somewhere
   inside it.
4. List every amenity within the walk at that distance. The panel counts
   these by band and lists them.
5. Build the bands from the same traversal by taking the reached nodes under
   each distance budget and wrapping them in `ST_ConcaveHull(..., 0.8)`.

The analysis is cached per start node (see [Deploying](#deploying)), so it
measures from the node. The API then adds the straight stretch from the
clicked point to that node to every distance, rescores, and drops anything it
takes past 1250 m — in `app/api/start.ts`, shared by both endpoints so the
analysis and a route always agree.

Counting both stretches matters more than it sounds. Before they counted, the
city centre's nearest bus stop read as a 60 m walk although it is 131 m away
in a straight line; it is now 167 m. The last stretch to a bus stop alone is
63 m at the median.

Scoring and isochrones share the traversal because they used to be two
separate endpoints running two separate traversals; merging them cut a click
from ~7 s to 0.4–2.1 s.

Category weights:

| Category | Weight | Max points |
|---|---|---|
| Supermarket | 0.30 | 30 |
| Clinic | 0.25 | 25 |
| School | 0.20 | 20 |
| Park | 0.15 | 15 |
| Bus stop | 0.10 | 10 |

Every category is always returned, including ones with nothing in range, so
the UI can explain a score without hardcoding the weights on the client.

Kindergartens are not schools and pharmacies are not clinics, so neither is
counted. Both were folded in originally, where they made up 83 of 141
"schools" and 27 of 79 "clinics" — a household without a preschooler gets
nothing from a kindy being close, and a pharmacy is not somewhere you see a
doctor, so counting them inflated the two heaviest weights with amenities most
people cannot use.

## API

```
GET /api/livability?lng=175.2793&lat=-37.7871
```

```jsonc
{
  "location": { "lng": 175.2793, "lat": -37.7871 },
  "total_score": 76.3,
  "breakdown": [
    { "category": "supermarket", "weighted_score": 19.2, "max_score": 30.0,
      "nearest_m": 450, "nearest_name": "NewSave" },
    { "category": "clinic",      "weighted_score": 18.4, "max_score": 25.0,
      "nearest_m": 332, "nearest_name": "New Zealand Blood Service Donor Centre" },
    { "category": "school",      "weighted_score": 17.9, "max_score": 20.0,
      "nearest_m": 134, "nearest_name": "Waikato Institue of Education" },
    { "category": "park",        "weighted_score": 12.1, "max_score": 15.0,
      "nearest_m": 242, "nearest_name": "Norris Ward Park" },
    { "category": "bus_stop",    "weighted_score": 8.7,  "max_score": 10.0,
      "nearest_m": 167, "nearest_name": "Transport Centre (Bryce St)" }
  ],
  "amenities": [
    { "id": 1627, "category": "school", "name": "Waikato Institue of Education", "walk_m": 134 },
    /* every amenity within 1250 m, nearest first */
  ],
  "isochrone": {
    "type": "FeatureCollection",
    "features": [{ "properties": { "minutes": 5 }, "geometry": { /* Polygon */ } }]
  }
}
```

A coordinate that is off the network (more than 200 m from any walkable way,
out in the farmland past the city, say) comes back with `total_score: 0` and
an empty feature list rather than an error. A request that is not a position
at all answers 400: `lng` and `lat` must each be given once, be wholly a
number (`175abc` is refused, not read as 175) and lie within ±180 and ±90.

```
GET /api/route?lng=175.2793&lat=-37.7871&amenity=1452
```

The walk to one listed amenity, from `walkreach_route(lng, lat, amenity)`:
a shortest path from the same start vertex to the same node the distance was
measured to, so the route and its two connectors together are `walk_m` long.

```jsonc
{
  "amenity": { "id": 1452, "category": "supermarket", "name": "NewSave", "walk_m": 450 },
  "destination": { "type": "Point", "coordinates": [175.2758777, -37.786535] },
  "route": { "type": "LineString", "coordinates": [/* ... */] },
  "connectors": { "type": "MultiLineString", "coordinates": [/* ... */] }
}
```

`connectors` are the two straight stretches off the network, from the point
to the network and from the network to the amenity. Both count in `walk_m`;
the map draws them dashed, since nobody mapped them as paths.
An amenity that is not within the walk answers 404.

```
GET /api/health
```

`{ "status": "ok" }` once a query has gone through to the database, or 503
if it cannot be reached — for an uptime monitor.

Addresses are resolved by [Nominatim](https://nominatim.openstreetmap.org),
proxied through `/api/geocode` so the request carries a User-Agent identifying
the project, as Nominatim's usage policy asks. Results are restricted to the
same Hamilton bounding box the network is clipped to — there is no point
resolving an address the router cannot reach. The lookup runs on submit rather
than per keystroke, which that policy also requires. A query matching more
than one place asks which one, since a street runs for kilometres and scores
differently along its length.

Suggestions while typing come from our own database instead, through
`/api/suggest` and `walkreach_suggest(text, n)`: the 77 suburbs and
localities OSM maps in Hamilton, every street name on the network, and the
named supermarkets, clinics, schools and parks. Matching is by the start of
the name or of any word in it, and from five characters on also by trigram
similarity, so a typo still finds the street. A suburb or an amenity is gone
to directly from its point; a street is handed to Nominatim, once, when it is
picked. A leading house number (`13 Huk`) is kept and only streets are
suggested for it.

## Tech stack

- **PostgreSQL 17** + **PostGIS 3.5** + **pgRouting 3.7.3** — network storage,
  routing and scoring, all in SQL
- **Next.js 16** (App Router, TypeScript), with route handlers for the API
  over one shared `pg` pool
- **MapLibre GL 6** over the [OpenFreeMap](https://openfreemap.org) Positron
  vector style, falling back to OpenStreetMap raster tiles — no map API key
  needed
- **OpenStreetMap** as the data source, imported with `osmium`,
  `osm2pgrouting` and `ogr2ogr`

## Running it

### 1. Database

`docker-compose.yml` brings up PostGIS + pgRouting on port 5433, with the
PostGIS and pgRouting extensions created on first start by `initdb/`:

```bash
docker compose up -d
```

### 2. Data

Everything in the database is rebuilt from an OpenStreetMap extract by one
script. It needs `osmium`, `osm2pgrouting` and `ogr2ogr` (GDAL) on your PATH,
and a New Zealand `.osm.pbf` from [Geofabrik](https://download.geofabrik.de/australia-oceania/new-zealand.html)
in `../data` (outside the repo — the extracts are 380 MB+ and are not
committed). The newest `new-zealand-*.osm.pbf` there is used, and
osm2pgrouting's pedestrian profile is found wherever it was installed. Then:

```bash
./sql/00-import.sh
```

Every setting can be overridden from the environment: `NZ_PBF` for the
extract, `PEDCONF` for the profile, `DATA_DIR`, and `PG_HOST`, `PG_PORT`,
`PG_DB`, `PG_USER`, `PG_PASS` for the database. The script creates the
extensions it needs, so it also builds into an empty database:

```bash
docker exec walkreach-db psql -U walkreach -c "CREATE DATABASE walkreach_rebuild"
PG_DB=walkreach_rebuild ./sql/00-import.sh
```

It clips Hamilton out of the NZ extract, builds the routable network, filters
and loads the amenities, precomputes the amenity/node pairs and creates the
functions — then prints counts to check against a known-good baseline.

| Step | Builds | Size |
|---|---|---|
| `osm2pgrouting` | `ways` — pedestrian edges, `length_m` in metres | ~45,700 |
| | `ways_vertices_pgr` — nodes, 98.1% in one connected component | ~36,500 |
| `01-amenities.sql` | `amenities` — five categories, with polygon footprints | ~1,600 |
| `02-amenity-nodes.sql` | `amenity_nodes` — (amenity, node) reachability pairs, with the last stretch between them | ~37,000 |
| `03-walkreach-analysis.sql` | `walkreach_origin`, `walkreach_analysis(lng, lat)` and `walkreach_route(lng, lat, amenity)` — what the API calls | |
| `04-livability-score.sql` | `livability_score(lng, lat)` and `get_isochrone(lng, lat)` — superseded, kept as the "before" that `npm run perf` times | |
| `05-search-names.sql` | `search_names` — suburbs, streets and named amenities for address suggestions | ~2,550 |
| `06-walkreach-suggest.sql` | `walkreach_suggest(text, n)` — what the suggestions API calls | |

Run into an empty database on 24 September 2026, the import reproduced the
development database exactly: the same row counts in every table, the same
scores, reach counts and routes at six test points, and all 96 database
tests and `npm run perf` passing against it.

The numbered SQL files are also safe to run on their own, in order, when you
only need to rebuild part of it. `02` exists so that scoring is an equality
join on node id rather than a spatial join per request, and has to be rebuilt
whenever `amenities` or `ways` changes — about a second. The matching radii
live there, not in the scoring function.

### 3. App

```bash
npm install
echo 'DATABASE_URL=postgresql://walkreach:walkreach@localhost:5433/walkreach' > .env.local
npm run dev
```

Open http://localhost:3000.

The MapLibre worker is copied into `public/maplibre/` by a `predev` /
`prebuild` hook — under Next.js 16 with Turbopack, MapLibre only loads
reliably via a named dynamic import inside `useEffect` with the worker served
from `public/`.

### 4. Tests

```bash
npm test              # unit: API routes and helpers, database mocked
npm run test:db       # database: the SQL against the imported data
npm run test:e2e      # end-to-end in Chromium, desktop and phone size
npm run perf          # query timings
```

The database tests need the imported data, but not the import itself:
`scripts/test-db.sh` builds a `walkreach_test` database from a 7.5 MB dump of
the import's raw tables, kept on the
[`test-data` release](https://github.com/derekdiliu/walkreach/releases/tag/test-data),
and runs every file in `sql/` from `01` on over it. CI does the same on every
push, so a change to the SQL is tested against all of Hamilton:

```bash
gh release download test-data --pattern walkreach-test.dump
./scripts/test-db.sh walkreach-test.dump
DATABASE_URL=postgresql://walkreach:walkreach@localhost:5433/walkreach_test npm run test:db
```

CI then runs the end-to-end suite over the same database, against the
production build laid out as the `Dockerfile` does.

[`docs/QA.md`](docs/QA.md) records a full run with its output, the
security testing and the known gaps; [`docs/BUGS.md`](docs/BUGS.md) logs
every defect fixed and the test that guards it.

## Deploying

`deploy/` runs the whole thing on one small Linux VM: Postgres with pgRouting,
the app, and Caddy in front for HTTPS. Only Caddy publishes ports (80 and 443).
It is sized for 1 GiB of RAM, which is too little to run `next build`, so
`.github/workflows/image.yml` type-checks and runs the unit, database and
end-to-end tests on every push to `main`, and only if they pass builds the app image and publishes it
to `ghcr.io/derekdiliu/walkreach`; the server only pulls it. Make that
package public once, under the repository's Packages settings, or the
server needs a `docker login ghcr.io` first.

On a fresh Ubuntu 24.04 VM with the `deploy/` directory copied to it:

```bash
sudo ./setup-server.sh            # 2 GiB swap, Docker; log out and back in
cp .env.example .env              # fill in DOMAIN and POSTGRES_PASSWORD
docker compose up -d db
```

The database is moved as a dump rather than rebuilt on the server, which would
need the OSM tooling and the 380 MB extract there too:

```bash
# on your machine
docker exec walkreach-db pg_dump -U walkreach -d walkreach -Fc > walkreach.dump
scp walkreach.dump <user>@<host>:~/deploy/

# on the server
docker compose exec -T db pg_restore -U walkreach -d walkreach --no-owner < walkreach.dump
docker compose up -d
```

Caddy fetches the certificate for `DOMAIN` on first start, so port 80 and 443
must already be open and the name must resolve to the VM. To ship a new
version after the image workflow finishes:

```bash
docker compose pull app && docker compose up -d app
```

The app sends its own security headers (a Content-Security-Policy, HSTS and
the rest, in `next.config.ts`), so Caddy only terminates TLS and proxies.
`/api/health` is what an uptime monitor should poll.

The app keeps analyses in memory, keyed by the network vertex a walk starts
from, so after restoring a new dump into the database run
`docker compose restart app` as well, or it keeps answering from the old data.

## Project structure

```
app/
  page.tsx                     the map page: state, and wiring the parts below
  _lib/walkreach.ts            API types, constants and pure helpers
  _lib/map-style.ts            MapLibre sources and layers
  _components/                 not routable (the _ prefix); each with a CSS module
    use-walk-map.ts            the map, its pins and GeoJSON sources
    use-walk-route.ts          the walk to a picked amenity
    use-address-search.ts      suggestions, Nominatim lookup, "which one?"
    WelcomeCard, ModeSwitch, SlotPicker, SearchBox, Intro,
    ScoreCard, ComparePanel, Legend, SlotBadge
  layout.tsx
  site-nav.tsx                 top bar
  how-it-works/page.tsx        method, weights and limitations for readers
  api/livability/route.ts      the scoring endpoint
  api/route/route.ts           the walk to one amenity
  api/geocode/route.ts         Nominatim proxy for address search
  api/suggest/route.ts         address suggestions while typing
  api/health/route.ts          uptime check, including the database
  api/start.ts                 adds the stretch from the point to the network
sql/
  00-import.sh                 OSM → database, one shot
  01-amenities.sql             categorised amenities table
  02-amenity-nodes.sql         precomputed amenity → node pairs
  03-walkreach-analysis.sql    walkreach_analysis(lng, lat), walkreach_route(...)
  04-livability-score.sql      superseded scorer and isochrone, the perf baseline
  05-search-names.sql          names to suggest in the address search
  06-walkreach-suggest.sql     walkreach_suggest(text, n)
docs/
  QA.md                        test results, security testing, known gaps
  BUGS.md                      every defect fixed and its regression test
  qa/<date>/                   raw output of each recorded run
initdb/
  01-extensions.sql            run once on first container start
docker-compose.yml             PostGIS + pgRouting on :5433, for development
Dockerfile                     production image (Next.js standalone output)
deploy/
  docker-compose.yml           db + app + Caddy for a single VM
  Caddyfile                    HTTPS and reverse proxy to the app
  .env.example                 DOMAIN and POSTGRES_PASSWORD
  setup-server.sh              swap and Docker on a fresh Ubuntu VM
scripts/
  perf.mts                     query timings
  test-db.sh                   the test database, from a dump of the raw tables
.github/workflows/image.yml    tests, then builds and publishes the image
```

## Limitations

These are known, not oversights:

- 30 of 1,642 amenities still have no network node in range and are
  invisible to scoring: 24 bus stops, 5 parks and a school. The bus stops are
  points, so footprint matching does not help them, and widening the radius
  past 100 m stops being honest about what it is correcting for. The parks
  are small ones set back from any footpath; some were matched before only
  because their centroid happened to fall near a node, which was luck, not
  reach.
- The stretches from the point to the network and from the network to an
  amenity are counted as straight lines. The first is 24 m at the median over
  800 points sampled along named streets, and under 89 m for nine in ten; but
  on a long road with few junctions the nearest node can be behind the point,
  and the walk then counts a stretch nobody would walk. Starting on the
  nearest edge instead (`pgr_withPoints`) would fix that, at the cost of the
  per-node cache.
- The bands are drawn from the start node, so they leave out the stretch
  from the point to it, which the listed distances include.
- Concave hull bands are one reasonable choice among several; buffer-and-union
  has not been compared yet.

## Roadmap

- Grid pre-computation to hold first-visit response times under ~2 s.
  Repeat visits are already cached: a click that starts from a vertex
  analysed before is answered from memory in milliseconds.

## About

WalkReach began as a COMPX576 research project for the Master of Information
Technology at the University of Waikato, and is now kept up as a personal
project. The code is under the [MIT License](LICENSE). Map data is ©
OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
