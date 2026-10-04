import { describe, expect, it } from "vitest";
import { LruCache } from "@/app/_lib/limits";

describe("LruCache", () => {
  it("drops the entry used longest ago once past its size", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // a is now the more recently used
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("counts a key set twice once", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("a", 2);
    cache.set("b", 3);
    expect(cache.get("a")).toBe(2);
    expect(cache.get("b")).toBe(3);
  });
});
