import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./db";

afterAll(() => pool.end());

type Row = { name: string; kind: string; context: string | null; lng: number | null; lat: number | null };

async function suggest(text: string, n = 6): Promise<Row[]> {
  const { rows } = await pool.query("SELECT walkreach_suggest($1, $2) AS s", [text, n]);
  return rows[0].s;
}

const names = async (text: string) => (await suggest(text)).map((r) => r.name);

describe("address suggestions", () => {
  it("completes the start of a name", async () => {
    expect(await names("vict")).toContain("Victoria Street");
  });

  it("completes the start of a later word", async () => {
    expect(await names("andrews")).toContain("Saint Andrews");
  });

  it("puts a suburb ahead of the streets named after it", async () => {
    expect((await names("chartw"))[0]).toBe("Chartwell");
  });

  it("forgives a typo from five characters on", async () => {
    expect(await names("vicotria")).toContain("Victoria Street");
  });

  it("does not guess from a few letters", async () => {
    // "vict" shares a trigram with Temple View; it must not be suggested.
    expect(await names("vict")).not.toContain("Temple View");
  });

  it("ignores case", async () => {
    expect(await names("VICTORIA")).toContain("Victoria Street");
  });

  it.each([["%"], ["_"], ["%%%"], ["\\"]])("treats %s as text, not a pattern", async (text) => {
    expect(await suggest(text)).toEqual([]);
  });

  it("tells the Woolworths apart by suburb", async () => {
    const rows = (await suggest("woolworths", 20)).filter((r) => r.name === "Woolworths");
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((r) => r.context)).size).toBe(rows.length);
  });

  it("gives places and amenities a point inside Hamilton, and streets none", async () => {
    for (const r of await suggest("hukanui", 20)) {
      if (r.kind === "street") {
        expect(r.lng).toBeNull();
      } else {
        expect(r.lng).toBeGreaterThan(175.16);
        expect(r.lng).toBeLessThan(175.37);
        expect(r.lat).toBeGreaterThan(-37.86);
        expect(r.lat).toBeLessThan(-37.68);
      }
    }
  });

  it("returns at most as many as asked for", async () => {
    expect(await suggest("ro", 4)).toHaveLength(4);
  });

  it("leaves bus stops out", async () => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM search_names WHERE kind = 'bus_stop'");
    expect(rows[0].n).toBe(0);
  });
});
