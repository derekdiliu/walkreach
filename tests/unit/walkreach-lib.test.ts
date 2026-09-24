import { describe, expect, it } from "vitest";
import {
  amenityName,
  formatPoint,
  parsePoint,
  scoreBand,
  suggestionKind,
  walkMinutes,
  withinMinutes,
} from "@/app/_lib/walkreach";

describe("walking time", () => {
  it("turns metres into minutes at 1250 m to 15 minutes, never under 1", () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(403)).toBe(5);
    expect(walkMinutes(1250)).toBe(15);
  });

  it("counts a walk as within a band up to and including its edge", () => {
    expect(withinMinutes(416, 5)).toBe(true);
    expect(withinMinutes(417, 5)).toBe(false);
    expect(withinMinutes(1250, 15)).toBe(true);
    expect(withinMinutes(1251, 15)).toBe(false);
  });
});

describe("score bands", () => {
  it.each([
    [100, "Everything close by"],
    [80, "Everything close by"],
    [79.9, "Mostly walkable"],
    [40, "Some essentials nearby"],
    [20, "Limited on foot"],
    [0, "Car-dependent"],
  ])("names %s %s", (score, label) => {
    expect(scoreBand(score).label).toBe(label);
  });
});

describe("names", () => {
  it("falls back to the kind for an amenity with no name", () => {
    expect(amenityName({ name: "NewSave", category: "supermarket" })).toBe("NewSave");
    expect(amenityName({ name: null, category: "bus_stop" })).toBe("Unnamed bus stop");
  });

  it("describes a suggestion by its kind and suburb", () => {
    expect(suggestionKind({ kind: "place", context: null })).toBe("Area");
    expect(suggestionKind({ kind: "street", context: "Hamilton North" })).toBe(
      "Street · Hamilton North",
    );
    expect(suggestionKind({ kind: "supermarket", context: "Chartwell" })).toBe(
      "Supermarket · Chartwell",
    );
  });
});

describe("points in the address bar", () => {
  it("round-trips a point at five decimal places", () => {
    const text = formatPoint({ lng: 175.279301, lat: -37.787104 });
    expect(text).toBe("175.27930,-37.78710");
    expect(parsePoint(text)).toEqual({ lng: 175.2793, lat: -37.7871 });
  });

  it.each([[null], [""], ["175.28"], ["abc,def"]])("reads %j as no point", (value) => {
    expect(parsePoint(value)).toBeNull();
  });
});
