import { Pool } from "pg";

// One pool for every route. Each route used to build its own, ten
// connections apiece by default, which on a 1 GiB server let thirty
// traversals run at once against a Postgres sized for a few. Four is enough
// to keep both CPUs busy; anything past that queues here instead of in the
// database.
//
// The slowest analysis measured is 1.6 s on a cold database, so a query
// still running after 10 s is stuck, not slow, and is cancelled rather than
// left to hold a connection the next request is waiting for.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  statement_timeout: 10_000,
});
