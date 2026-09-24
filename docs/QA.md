# Testing and quality assurance

A record of what is tested, how, and the results of a full run. The raw
output of every run is kept beside it in `docs/qa/<date>/`, so each figure
here can be checked against the log it came from.

Defects found and fixed, each linked to its regression test, are in
[`BUGS.md`](BUGS.md).

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
| Vulnerable dependencies | `npm audit`; Next.js upgraded from 16.3.1 to 16.3.6 for two critical advisories (B16) | `npm audit`: 0 vulnerabilities |
| Exposed database | In production only Caddy publishes ports (80, 443); PostgreSQL is reachable only inside the Docker network, with a generated password; HTTPS throughout | configuration: `deploy/docker-compose.yml` |

## Known gaps

- **No continuous integration.** The suites are run by hand and recorded
  here. The database and end-to-end suites need the imported Hamilton data,
  which is not in the repository.
- **No rate limiting.** An analysis takes up to about 1.5 s of database time
  on a 1 GiB server, so a flood of requests could slow the site for others.
- **The map drawing itself is not tested automatically.** The end-to-end
  tests check the data sent to the map, not the pixels drawn; B01 and B08
  were checked by eye.
- **No load test** beyond the timings above.
