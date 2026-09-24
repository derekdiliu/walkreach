# Bug log

Every defect found and fixed in WalkReach, oldest first, with the commit that
fixed it and the test that now guards against it coming back. The commit
messages hold the full measurements; this log is the index to them.

Where a defect has no automated regression test, the entry says so and how
the fix was checked instead.

Test references: **unit** is `tests/unit/`, **db** is `tests/db/` (run
against the real PostGIS database), **e2e** is `e2e/walkreach.spec.ts`.

| ID | Fixed | Defect | Severity | Regression test |
|---|---|---|---|---|
| B01 | 2026-09-10 | Walking bands never drawn on the map | High | None automated |
| B02 | 2026-09-10 | A click before the map style loaded lost its bands | Medium | None automated |
| B03 | 2026-09-12 | A fifth of amenities invisible to scoring | High | db, pinned scores |
| B04 | 2026-09-12 | Coverage figures and matching rule misstated | Low | None (documentation) |
| B05 | 2026-09-13 | Bands stacked into one colour; some GeoJSON invalid | Medium | db, spatial |
| B06 | 2026-09-13 | Kindergartens counted as schools, pharmacies as clinics | High | db, pinned scores |
| B07 | 2026-09-13 | Almost no map on a phone | Medium | e2e |
| B08 | 2026-09-22 | Welcome card spilled over the top bar on a phone | Medium | None automated |
| B09 | 2026-09-22 | Points far off the network scored from wherever it ended | High | db, spatial |
| B10 | 2026-09-23 | 19% of Hamilton never imported | High | db, spatial |
| B11 | 2026-09-23 | Walks started on isolated path fragments | High | db, spatial |
| B12 | 2026-09-24 | Malformed coordinates accepted; large amenity id gave a 500 | Medium | unit |
| B13 | 2026-09-24 | Every point amenity lost its name | Medium | db, reach |
| B14 | 2026-09-24 | "Show me an example" did nothing on a slow connection | High | e2e |
| B15 | 2026-09-25 | Timing script and import failed on a fresh machine | Medium | Manual rebuild |
| B16 | 2026-09-25 | Next.js with published critical advisories | High | `npm audit` |

Severity: **High** gives a wrong score or answer, or breaks a main task;
**Medium** is wrong or broken but with a way round it, or only in one
setting; **Low** is documentation only.

---

## B01 Walking bands never drawn on the map

- **Symptom:** clicking the map returned bands from the API, but nothing was
  drawn.
- **Cause:** Turbopack rewrites `import.meta.url`, so MapLibre looked for its
  web worker at a chunk path where it does not exist. The worker failed
  silently and GeoJSON sources, parsed off the main thread, never rendered.
- **Fix:** `191aeeb`. A copy of the worker is served from `public/maplibre/`
  and MapLibre is pointed at it (`copy:maplibre-worker` in `package.json`).
- **Regression test:** none automated. The e2e tests check the analysis
  response, not the pixels on the map. Checked by eye, and in every
  screenshot taken since.

## B02 A click before the map style loaded lost its bands

- **Symptom:** a very early click scored but drew no bands.
- **Cause:** the result was written to a GeoJSON source that did not exist
  yet, and the write was dropped.
- **Fix:** `99a2c24`. The data is held until the style has loaded
  (`setData` in `app/_components/use-walk-map.ts`).
- **Regression test:** none dedicated. B14 later made the buttons wait for
  the map, which removes most of the window this could happen in.

## B03 A fifth of amenities invisible to scoring

- **Symptom:** parks and schools scored as unreachable from places next to
  them.
- **Cause:** a polygon amenity was reduced to its centroid and matched to
  network nodes within 50 m of it. A park's centroid is on average 197 m
  inside it, so 318 of 1,506 amenities, including 107 of 201 parks, had no
  node in range.
- **Fix:** `6431410` widened the radius to 100 m as a stopgap; `76374a1`
  matches polygons on their footprint (50 m) and points at 100 m. Coverage
  rose to 1,481 of 1,506.
- **Regression test:** db `scoring.test.ts` "still scores … at …" pins the
  scores at seven points, which move if matching changes.

## B04 Coverage figures and matching rule misstated

- **Symptom:** the README gave the bus stop gap as 166 and said polygons were
  matched "along their boundary".
- **Cause:** 166 was the figure at 50 m, not the 100 m in use (it is 20), and
  `ST_DWithin` against a polygon matches its interior too.
- **Fix:** `cc250d8` corrected the figures and wording.
- **Regression test:** none; documentation.

## B05 Bands stacked into one colour; some GeoJSON invalid

- **Symptom:** the three bands all rendered as the same blend of colours, and
  at some locations the returned GeoJSON was invalid.
- **Cause:** each band was a whole polygon, so the centre was filled three
  times over. Cutting them into rings left hairline slivers that became
  degenerate rings when reprojected.
- **Fix:** `bafb9e8`. Each band is only the area it adds; slivers are dropped
  by width after `ST_MakeValid`, and coordinates are rounded with
  `ST_ReducePrecision` so serialising cannot refold an edge.
- **Regression test:** db `spatial.test.ts` "draws valid polygons that do not
  overlap each other", from five points around the city.

## B06 Kindergartens counted as schools, pharmacies as clinics

- **Symptom:** scores too high; the city centre's nearest "clinic" was a
  pharmacy 45 m away.
- **Cause:** `01-amenities.sql` folded `amenity=kindergarten` into schools and
  `amenity=pharmacy` into clinics: 83 of 141 schools and 27 of 79 clinics, in
  the two categories carrying 45% of the weight.
- **Fix:** `a39560c`. Neither is counted. The city centre fell from 85.0 to
  80.3.
- **Regression test:** db `scoring.test.ts` pins the city centre at 80.3.

## B07 Almost no map on a phone

- **Symptom:** a 380 px panel beside the map left a phone with a sliver of
  map.
- **Fix:** `f2ffe19`. Below 760 px the map stacks above the panel.
- **Regression test:** e2e "map and panel both fit the screen", run at Pixel 7
  size, and a no-sideways-scroll check in several tests.

## B08 Welcome card spilled over the top bar on a phone

- **Symptom:** on a Pixel 7 the card (526 px) overflowed the map (436 px),
  covering the top bar, so How it works could not be tapped until the card
  was dismissed.
- **Fix:** `f7a25a3`. The card is capped at the map's height and scrolls, with
  its buttons pinned.
- **Regression test:** none dedicated. Checked by screenshot at Pixel 7 size.

## B09 Points far off the network scored from wherever it ended

- **Symptom:** a point in farmland 2.3 km past the import boundary scored 13.
- **Cause:** the walk started at the nearest network vertex however far away
  it was.
- **Fix:** `7cd1aeb`. A point more than 200 m from every walkable way has no
  start: score 0, no bands, and the page says it is outside the network.
- **Regression test:** db `spatial.test.ts` "points off the walking network",
  including a point on Hamilton Lake 180 m from the path that must still
  score.

## B10 19% of Hamilton never imported

- **Symptom:** Rototuna North, Huntington, Ruakura and Silverdale came back as
  outside the network.
- **Cause:** the import box, `175.20,-37.85,175.32,-37.73`, fell short of the
  city boundary on the north and east.
- **Fix:** `3fb87f6`. The box is the city boundary plus about 1.5 km:
  `175.16,-37.86,175.37,-37.68`.
- **Regression test:** db `spatial.test.ts` "coverage of the whole city", five
  suburbs from the missing strips.

## B11 Walks started on isolated path fragments

- **Symptom:** a point beside Victoria Street in the city centre scored 25
  instead of 73.6, with no bands and "outside the network" under the score.
- **Cause:** a few hundred vertices sit in fragments joined to nothing else,
  and 1.8% of the city by area snapped to one.
- **Fix:** `dbb9c84`. The largest connected component is flagged, and a walk
  only starts on it.
- **Regression test:** db `spatial.test.ts` "fragments cut off from the
  network", four known fragment locations.

## B12 Malformed coordinates accepted; large amenity id gave a 500

- **Symptom:** `lng=175abc` was scored as 175; `lat=999` and `lng=Infinity`
  reached the database; `amenity=2147483648` failed there as a 500.
- **Cause:** `parseFloat` reads the number off the front of a string, nothing
  checked the range, and `Number` accepts `" 12 "`, `"0x10"` and `"1e3"`.
- **Fix:** `9ebe2f0`. `app/api/params.ts` parses strictly: one value, wholly a
  decimal, within ±180/±90, and ids within a Postgres integer. Anything else
  is a 400 before the database is asked.
- **Regression test:** unit `livability-route.test.ts` and
  `route-route.test.ts`, 34 rejected inputs and 5 edge values that must pass.

## B13 Every point amenity lost its name

- **Symptom:** the Woolworths at Chartwell was listed as "Unnamed
  supermarket", as were all 11 point supermarkets and every bus stop.
- **Cause:** ogr2ogr puts `name` and `highway` in columns of their own on the
  points layer, and `01-amenities.sql` read them from `other_tags`.
- **Fix:** `5652084`. Names come from the column; 1,177 bus stops and all 30
  supermarkets are now named.
- **Regression test:** db `reach.test.ts` "keeps the name OSM gives every
  point amenity" and "names the Woolworths at Chartwell".

## B14 "Show me an example" did nothing on a slow connection

- **Symptom:** on the live site, a click in the first second threw
  `w.current is not a constructor` and nothing happened.
- **Cause:** the buttons were live before MapLibre had loaded and the map
  existed. Locally it loaded fast enough that the tests never saw it.
- **Found by:** running the e2e suite against the live site.
- **Fix:** `149c89e`. Everything that places a point is disabled until the
  map is ready.
- **Regression test:** e2e "the example waits for a slow map rather than
  failing" delays every script by 3 s and checks the example still scores
  with no page error. It fails without the fix.

## B15 Timing script and import failed on a fresh machine

- **Symptom:** `npm run perf` failed with `function get_isochrone does not
  exist`; the import named a dated extract and a Homebrew path.
- **Cause:** `get_isochrone()` had only ever been created by hand in the
  development database, and the paths were specific to one machine.
- **Fix:** `cf63433`. The function is kept in `04-livability-score.sql`, and
  the import finds its inputs and takes settings from the environment.
- **Regression test:** a manual rebuild into an empty database, which matched
  the development database table for table and passed all db tests and
  `npm run perf` (see `docs/QA.md`).

## B16 Next.js with published critical advisories

- **Symptom:** `npm audit` reported Next.js 16.3.1 as critical
  (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4, both remote code execution) and
  its `sharp` dependency as high (GHSA-rgj7-g3m4-5g8c).
- **Exposure:** the app does not use `next/image`, but Next's image
  optimisation endpoint is served by default; the server is Linux.
- **Fix:** upgraded to Next.js 16.3.6, which brings `sharp` 0.35.4.
- **Regression test:** `npm audit` reports 0 vulnerabilities
  (`docs/qa/2026-09-25/npm-audit.txt`), and every suite passes on 16.3.6.
