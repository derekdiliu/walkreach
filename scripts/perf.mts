// Query timing for the report: how long an analysis takes, cold and warm, and
// what the single traversal over precomputed amenity_nodes saved against the
// superseded livability_score() + get_isochrone() pair.
//
//   node scripts/perf.mts                 warm timings against DATABASE_URL
//   node scripts/perf.mts --cold          restart the database container first
//   node scripts/perf.mts --api URL       also time GET URL/api/livability
//   node scripts/perf.mts --runs 10       repetitions per point (default 5)
//
// Prints Markdown tables to paste into the report.
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import pg from "pg";

const { values: args } = parseArgs({
  options: {
    cold: { type: "boolean", default: false },
    api: { type: "string" },
    runs: { type: "string", default: "5" },
  },
});
const RUNS = Number(args.runs);

try {
  process.loadEnvFile(".env.local");
} catch {}

// The same spread of points the database tests use.
const POINTS: [string, number, number][] = [
  ["CBD", 175.2793, -37.7871],
  ["CBD edge", 175.283, -37.787],
  ["North-west", 175.2570103, -37.7376565],
  ["Hamilton East", 175.308185, -37.7857515],
  ["South", 175.2749877, -37.8053868],
];

const CURRENT = "SELECT walkreach_analysis($1, $2)";
const SUPERSEDED =
  "SELECT (SELECT json_agg(s) FROM livability_score($1, $2) s)," +
  " (SELECT json_agg(i) FROM get_isochrone($1, $2) i)";

const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const fmt = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${Math.round(x)} ms`);

async function time(client: pg.Client, sql: string, lng: number, lat: number) {
  const start = process.hrtime.bigint();
  await client.query(sql, [lng, lat]);
  return ms(start);
}

async function waitForDatabase() {
  for (let i = 0; i < 60; i++) {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await c.connect();
      await c.query("SELECT 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      await c.end().catch(() => {});
    }
  }
  throw new Error("database did not come back after restart");
}

if (args.cold) {
  // Restarting Postgres empties shared_buffers; the OS page cache survives,
  // so this is cold for the database, not for the disk.
  console.error("restarting walkreach-db...");
  execSync("docker restart walkreach-db", { stdio: "ignore" });
  await waitForDatabase();
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log(`\n## walkreach_analysis — ${args.cold ? "after a database restart" : "warm database"}, ${RUNS} runs per point\n`);
console.log("| Point | First run | Median of the rest | Slowest of the rest |");
console.log("|---|---|---|---|");
const allWarm: number[] = [];
for (const [label, lng, lat] of POINTS) {
  const first = await time(client, CURRENT, lng, lat);
  const rest: number[] = [];
  for (let i = 1; i < RUNS; i++) rest.push(await time(client, CURRENT, lng, lat));
  allWarm.push(...rest);
  console.log(`| ${label} | ${fmt(first)} | ${fmt(median(rest))} | ${fmt(Math.max(...rest))} |`);
}
console.log(`\nMedian over all repeat runs: ${fmt(median(allWarm))}`);

console.log("\n## Superseded pair vs walkreach_analysis (median per point)\n");
console.log(
  "Old: livability_score() + get_isochrone(), two traversals, amenities joined to\n" +
    "reached nodes per request. New: one traversal over precomputed amenity_nodes.\n" +
    "Not like-for-like on the score (see sql/04-livability-score.sql): the timing\n" +
    "shows both changes together.\n",
);
console.log("| Point | Old | New | Speed-up |");
console.log("|---|---|---|---|");
for (const [label, lng, lat] of POINTS) {
  const old: number[] = [];
  const now: number[] = [];
  // Alternate, so neither side gets a warmer cache than the other.
  for (let i = 0; i < RUNS; i++) {
    old.push(await time(client, SUPERSEDED, lng, lat));
    now.push(await time(client, CURRENT, lng, lat));
  }
  const o = median(old);
  const n = median(now);
  console.log(`| ${label} | ${fmt(o)} | ${fmt(n)} | ${(o / n).toFixed(1)}× |`);
}

await client.end();

if (args.api) {
  const base = args.api.replace(/\/$/, "");
  console.log(`\n## End to end: GET ${base}/api/livability\n`);
  console.log("| Point | First request | Median of the rest | Response size |");
  console.log("|---|---|---|---|");
  for (const [label, lng, lat] of POINTS) {
    const times: number[] = [];
    let bytes = 0;
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      const res = await fetch(`${base}/api/livability?lng=${lng}&lat=${lat}`);
      const body = await res.arrayBuffer();
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      times.push(ms(start));
      bytes = body.byteLength;
    }
    console.log(
      `| ${label} | ${fmt(times[0])} | ${fmt(median(times.slice(1)))} | ${(bytes / 1024).toFixed(0)} KB |`,
    );
  }
}
