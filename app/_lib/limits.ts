import { NextRequest, NextResponse } from "next/server";

// A map with a size cap that drops whatever was used longest ago. A Map
// iterates in insertion order, so re-inserting on every read keeps the
// least recently used entry first.
export class LruCache<V> {
  private entries = new Map<string, V>();
  constructor(private readonly max: number) {}

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: V) {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.max) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}

// Requests per client per minute, counted in fixed one-minute windows. In
// memory, since there is one app process. The client is the first address
// in X-Forwarded-For: Caddy replaces that header rather than appending to
// whatever the client sent, so it cannot be forged from outside.
const windows = new Map<string, { start: number; count: number }>();

export function tooMany(
  req: NextRequest,
  name: string,
  perMinute: number,
): NextResponse | null {
  const client =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = `${name} ${client}`;
  const now = Date.now();

  // Drop finished windows now and then, so the map holds recent clients only.
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (now - w.start >= 60_000) windows.delete(k);
  }

  const w = windows.get(key);
  if (!w || now - w.start >= 60_000) {
    windows.set(key, { start: now, count: 1 });
    return null;
  }
  if (++w.count <= perMinute) return null;

  const retryAfter = Math.ceil((w.start + 60_000 - now) / 1000);
  return NextResponse.json(
    { error: "Too many requests, try again shortly" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
