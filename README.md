# WalkReach

> **Work in progress.** This is an active COMPX576 research project, not a
> finished product. The core — network routing, scoring and isochrones — works
> end to end, but the layout is desktop-only and nothing is deployed yet. See [Limitations](#limitations) and
> [Roadmap](#roadmap) for what is still open.

An interactive walkability tool for Hamilton, New Zealand. Click anywhere on the
map and WalkReach shows you how far you can actually walk in 5, 10 and 15
minutes — and how well that area is served by supermarkets, clinics, schools,
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

## How it works

Walking speed is taken as 1.4 m/s, which turns the three time budgets into
distance budgets of 417 / 833 / 1250 m.

A single call to `walkreach_analysis(lng, lat)` does everything:

1. Snap the clicked coordinate to the nearest node in the pedestrian network.
2. Run **one** `pgr_drivingDistance` traversal out to the 1250 m budget.
3. Score amenities from that traversal — for each category, find the nearest
   reachable one and decay its distance linearly (0 m = full marks,
   1250 m or unreachable = zero), then weight it. A park or school is matched
   against its whole footprint, so the distance is to the nearest part of it
   you could walk up to, not to a centroid sitting somewhere inside it.
4. Build the bands from the same traversal by taking the reached nodes under
   each distance budget and wrapping them in `ST_ConcaveHull(..., 0.8)`.

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
  "total_score": 80.3,
  "breakdown": [
    { "category": "supermarket", "weighted_score": 20.3, "max_score": 30.0,
      "nearest_m": 403, "nearest_name": "NewSave" },
    { "category": "clinic",      "weighted_score": 19.4, "max_score": 25.0,
      "nearest_m": 281, "nearest_name": "New Zealand Blood Service Donor Centre" },
    { "category": "school",      "weighted_score": 18.6, "max_score": 20.0,
      "nearest_m": 87,  "nearest_name": "Waikato Institue of Education" },
    { "category": "park",        "weighted_score": 12.5, "max_score": 15.0,
      "nearest_m": 208, "nearest_name": "Norris Ward Park" },
    { "category": "bus_stop",    "weighted_score": 9.5,  "max_score": 10.0,
      "nearest_m": 60,  "nearest_name": "Transport Centre (Bryce St)" }
  ],
  "isochrone": {
    "type": "FeatureCollection",
    "features": [{ "properties": { "minutes": 5 }, "geometry": { /* Polygon */ } }]
  }
}
```

A coordinate that is off the network (in the middle of the river, say) comes
back with `total_score: 0` and an empty feature list rather than an error.

## Tech stack

- **PostgreSQL 16** + **PostGIS 3.5** + **pgRouting 3.7.3** — network storage,
  routing and scoring, all in SQL
- **Next.js 16** (App Router, TypeScript) with a single route handler and the
  `pg` driver
- **MapLibre GL 6** with OpenStreetMap raster tiles — no map API key needed
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
committed). Point `NZ_PBF` at your download, then:

```bash
./sql/00-import.sh
```

It clips Hamilton out of the NZ extract, builds the routable network, filters
and loads the amenities, precomputes the amenity/node pairs and creates the
functions — then prints counts to check against a known-good baseline.

| Step | Builds | Size |
|---|---|---|
| `osm2pgrouting` | `ways` — pedestrian edges, `length_m` in metres | ~37,500 |
| | `ways_vertices_pgr` — nodes, 98.8% in one connected component | ~30,000 |
| `01-amenities.sql` | `amenities` — five categories, with polygon footprints | ~1,400 |
| `02-amenity-nodes.sql` | `amenity_nodes` — (amenity, node) reachability pairs | ~33,000 |
| `03-walkreach-analysis.sql` | `walkreach_analysis(lng, lat)` — what the API calls | |
| `04-livability-score.sql` | `livability_score(lng, lat)` — superseded, kept for comparison | |

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

## Project structure

```
app/
  page.tsx                     map, side panel, onboarding card
  layout.tsx
  api/livability/route.ts      the single endpoint
sql/
  00-import.sh                 OSM → database, one shot
  01-amenities.sql             categorised amenities table
  02-amenity-nodes.sql         precomputed amenity → node pairs
  03-walkreach-analysis.sql    walkreach_analysis(lng, lat)
  04-livability-score.sql      superseded scorer, kept for the report
initdb/
  01-extensions.sql            run once on first container start
docker-compose.yml             PostGIS + pgRouting on :5433
```

## Limitations

Current state as of the mid-trimester break — these are known and being worked
on, not oversights:

- The import script has been verified step by step against the existing
  database, but not yet run end to end against an empty one.
- 23 of 1,396 amenities still have no network node in range and are invisible
  to scoring: 20 bus stops and 3 parks. The bus stops are points, so
  footprint matching does not help them, and widening the radius past 100 m
  stops being honest about what it is correcting for. The 3 parks are small
  ones set back from any footpath — they were matched before only because
  their centroid happened to fall near a node, which was luck, not reach.
- The layout is a fixed 380 px panel beside the map, which leaves a phone with
  very little map.
- Locations are chosen by clicking; there is no address search.
- Concave hull bands are one reasonable choice among several; buffer-and-union
  has not been compared yet.

## Roadmap

- Address search, and a compare-two-locations mode
- Highlight the walking path to a chosen amenity
- Responsive layout
- Grid pre-computation and caching to hold response times under ~2 s
- Deployment with PostGIS and pgRouting co-located

## About

WalkReach is a COMPX576 research project for the Master of Information
Technology at the University of Waikato, and is still under active
development. Map data is © OpenStreetMap
contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright).
