# Testing and quality assurance

A record of what is tested, how, and the results of each recorded run,
newest first. The raw output of every run is kept beside it in
`docs/qa/<date>/`, so each figure here can be checked against the log it
came from.

Defects found and fixed, each linked to its regression test, are in
[`BUGS.md`](BUGS.md).

## Run of 10 October 2026, after upgrading Next.js

Next.js went from 16.3.6 to 16.4.0 (`790c784`), with sharp and
source-map-js updated by `npm audit fix`, for high-severity advisories
published after the 25 September run. Every suite the upgrade could affect
was run again; the image built from that commit is the one deployed.

| Suite | Tests | Result | Output |
|---|---|---|---|
| Unit | 96 | 96 passed | [`unit.txt`](qa/2026-10-10/unit.txt) |
| End-to-end, local | 26 | 26 passed | [`e2e-local.txt`](qa/2026-10-10/e2e-local.txt) |
| End-to-end, live | 26 | 26 passed | [`e2e-live.txt`](qa/2026-10-10/e2e-live.txt) |
| Dependency audit | — | 0 vulnerabilities | [`npm-audit.txt`](qa/2026-10-10/npm-audit.txt) |

The counts have grown since 25 September. The unit tests went from 79 to
96 with the analysis cache and the per-client rate limits (`64ee9dd`, 14
tests) and the basemap style (`052a8aa`, 3 tests). The end-to-end suite gained "a failed analysis says
so and can be retried" (`89b0bbd`), run at both screen sizes. As before,
the local run was against the standalone server laid out as the
`Dockerfile` does, and the live run against the Azure VM.

The database suite and the timings were not run again. Nothing under
`sql/` or `tests/db/` has changed since 25 September and the data is the
same import, so those results below still describe the SQL that is
deployed.

Environment as on 25 September, except: commit `790c784`, Next.js 16.4.0.

## Full run, 25 September 2026

| Suite | What it checks | Tests | Result | Output |
|---|---|---|---|---|
| Unit | API routes with the database and Nominatim mocked: validation, response shape, error statuses; pure helpers | 79 | 79 passed | [`unit.txt`](qa/2026-09-25/unit.txt) |
| Database | The SQL against the real PostGIS database: river barrier, band validity, coverage, scoring rules, pinned scores, reach lists, routes, names, suggestions | 96 | 96 passed | [`db.txt`](qa/2026-09-25/db.txt) |
| End-to-end, local | The production build in Chromium at desktop and Pixel 7 size: example, map click, shared and compare links, reach list and route, suggestions, start over, layout, slow map | 24 | 24 passed | [`e2e-local.txt`](qa/2026-09-25/e2e-local.txt) |
| End-to-end, live | The same 24 tests against https://walkreach.australiaeast.cloudapp.azure.com, after deploying this commit's image | 24 | 24 passed | [`e2e-live.txt`](qa/2026-09-25/e2e-live.txt) |
| Dependency audit | `npm audit` over the whole tree | — | 0 vulnerabilities | [`npm-audit.txt`](qa/2026-09-25/npm-audit.txt) |
| Performance | `npm run perf`: query timings, and against the superseded implementation | — | median 490 ms | [`perf.txt`](qa/2026-09-25/perf.txt) |

The end-to-end suite ran against the standalone server the production image
runs (`node .next/standalone/server.js`, laid out as the `Dockerfile` does),
not the development server, with 12 tests each at the two screen sizes.
The live run went over the internet to the Azure VM, where the network and
MapLibre load more slowly; that is the setting B14 only showed up in.

### Environment

| | |
|---|---|
| Commit | the commit that adds this file, on top of `cf63433` |
| Node.js | 22.22.1 |
| Next.js | 16.3.6 |
| PostgreSQL / PostGIS / pgRouting | 17.5 / 3.5.2 / 3.7.3 |
| Vitest / Playwright / Chromium | 5.0.1 / 1.63.0 / 153.0.8010.12 |
| Data | OpenStreetMap New Zealand extract of 25 July 2026, clipped to `175.16,-37.86,175.37,-37.68` |

### Reproducing a run

```bash
docker compose up -d        # PostGIS + pgRouting, with the imported data
npm test                    # unit
npm run test:db             # database
npm run test:e2e            # end-to-end, starts next dev on port 3100
npm run perf                # timings
npm audit
```

## Reproducibility

On 24 September 2026 the whole import (`sql/00-import.sh`) was run into an
empty database and compared with the development database. Every table had
the same row count (45,660 ways, 36,538 vertices, 1,642 amenities, 37,005
amenity–node pairs, 2,550 search names), and six test points gave the same
score, the same number of amenities within reach and the same route length.
All 96 database tests and `npm run perf` passed against the rebuilt
database. See B15 in the bug log for what had to change first.

## Performance

Warm database, median of five runs per point, from
[`perf.txt`](qa/2026-09-25/perf.txt). The median over every repeat run is
490 ms.

| Point | Now | Superseded pair | Speed-up |
|---|---|---|---|
| City centre | 672 ms | 6.39 s | 9.5× |
| City centre edge | 487 ms | 5.55 s | 11.4× |
| North-west | 1.46 s | 2.74 s | 1.9× |
| Hamilton East | 465 ms | 2.35 s | 5.0× |
| South | 333 ms | 2.05 s | 6.2× |

The superseded pair is `livability_score()` plus `get_isochrone()`: two
network traversals, and amenities joined to reached nodes on every request.
It also measures to a polygon's centroid rather than its footprint, so the
comparison shows both changes together, not the speed-up alone. Measured
separately in psql, a route to one amenity takes about 70 ms and an address
suggestion about 50 ms.

## Security testing

WalkReach has no accounts and stores nothing a visitor sends, so the risks
are in what reaches the database, what reaches third parties, and what the
server gives away. Each control and the tests that hold it:

| Risk | Control | Tested by |
|---|---|---|
| SQL injection | Every query is one fixed statement with bind parameters (`$1`, `$2`, …); nothing a visitor sends is put into SQL text | unit: "passes the coordinates as bind parameters", and the same for route and suggest; "SQL in place of a number" is refused with 400 |
| Pattern injection in search | Typed text is escaped before `LIKE`, so `%` and `_` match themselves | db `suggest.test.ts`: "treats % / _ / %%% / \\ as text, not a pattern" |
| Malformed or hostile input | `app/api/params.ts`: each value once, wholly a decimal number, coordinates within ±180 / ±90, ids within a Postgres integer; suggestions 2–100 characters; searches at least 3 | unit: 34 inputs refused with 400 before any query (trailing junk, hexadecimal, `Infinity`, `NaN`, out of range, repeated, whitespace, `<script>`, SQL), 5 edge values accepted, 3 suggestion lengths refused, 3 short searches refused |
| Leaking internals in errors | A database failure answers `{"error": "Database query failed"}` with status 500; a Nominatim failure answers 502 | unit: "answers 500 without leaking the database error" for all three database routes; 502 for both Nominatim failures |
| Cross-site scripting | React escapes all text; no `innerHTML` or `dangerouslySetInnerHTML` anywhere; OpenStreetMap names are rendered as text | code check (`grep`), and `<script>` as a coordinate is refused |
| Overloading Nominatim | Proxied with an identifying User-Agent as its usage policy asks; asked only on submit or on picking a street, never per keystroke; bounded to Hamilton | unit: "asks Nominatim for NZ results bounded to the routable Hamilton box"; e2e: picking a suburb makes no geocode request |
| Vulnerable dependencies | `npm audit`; Next.js upgraded from 16.3.1 to 16.3.6 for two critical advisories (B16), and to 16.4.0 for the high-severity ones published after that | `npm audit`: 0 vulnerabilities on 10 October 2026 |
| Exposed database | In production only Caddy publishes ports (80, 443); PostgreSQL is reachable only inside the Docker network, with a generated password; HTTPS throughout | configuration: `deploy/docker-compose.yml` |

## Known gaps

- **Only part of the testing runs in CI.** Every push to `main` type-checks
  and runs the unit tests before the image is built
  (`.github/workflows/image.yml`). The database and end-to-end suites need
  the imported Hamilton data, which is not in the repository, so they are
  run by hand and recorded here.
- **Rate limits are per client only.** Each client is limited (60 analyses
  a minute, 120 routes, 20 address lookups), the database pool is capped at
  four connections and a query is cancelled after 10 s. Many clients at
  once could still slow the site on a 1 GiB server; see the load test gap
  below.
- **The map drawing itself is not tested automatically.** The end-to-end
  tests check the data sent to the map, not the pixels drawn; B01 and B08
  were checked by eye.
- **No load test** beyond the timings above.
