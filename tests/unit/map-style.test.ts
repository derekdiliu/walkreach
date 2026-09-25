import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { withOverlays } from "@/app/_lib/map-style";

const base: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background" },
    { id: "roads", type: "background" },
    { id: "road-names", type: "symbol", source: "x" },
    { id: "place-names", type: "symbol", source: "x" },
  ],
};

describe("withOverlays", () => {
  it("puts the walk under the basemap's labels", () => {
    const ids = withOverlays(base).layers.map((l) => l.id);
    expect(ids.indexOf("isochrone-fill")).toBeGreaterThan(ids.indexOf("roads"));
    expect(ids.indexOf("route-destination")).toBeLessThan(ids.indexOf("road-names"));
    expect(ids.at(-1)).toBe("place-names");
  });

  it("adds its sources beside the basemap's", () => {
    const sources = Object.keys(withOverlays(base).sources);
    expect(sources).toEqual(expect.arrayContaining(["isochrone-a", "isochrone-b", "route"]));
  });

  it("goes on top when the basemap has no labels", () => {
    const ids = withOverlays({ ...base, layers: base.layers.slice(0, 2) }).layers.map((l) => l.id);
    expect(ids.slice(0, 2)).toEqual(["background", "roads"]);
    expect(ids.at(-1)).toBe("route-destination");
  });
});
