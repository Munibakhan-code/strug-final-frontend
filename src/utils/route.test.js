import { describe, it, expect } from "vitest";
import { decodePolyline, routePath } from "./route.js";

// "_p~iF~ps|U_ulLnnqC" is the canonical Google example: (38.5,-120.2) -> (40.7,-120.95)
const ENCODED = "_p~iF~ps|U_ulLnnqC";

describe("decodePolyline", () => {
  it("decodes an encoded polyline", () => {
    const pts = decodePolyline(ENCODED);
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(38.5, 4);
    expect(pts[0][1]).toBeCloseTo(-120.2, 4);
  });

  it("returns [] instead of throwing on a non-string", () => {
    // This is what actually happened in prod: overview_polyline.points was undefined, and the
    // throw landed inside the Directions callback, killing it silently.
    expect(decodePolyline(undefined)).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline({})).toEqual([]);
  });
});

describe("routePath — every shape Maps JS has shipped", () => {
  it("reads overview_path (current SDK: LatLng objects)", () => {
    const route = {
      overview_path: [
        { lat: () => 43.64, lng: () => -79.38 },
        { lat: () => 43.65, lng: () => -79.39 },
      ],
    };
    expect(routePath(route)).toEqual([
      [43.64, -79.38],
      [43.65, -79.39],
    ]);
  });

  it("reads overview_path when lat/lng are plain numbers, not accessors", () => {
    const route = { overview_path: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] };
    expect(routePath(route)).toEqual([[1, 2], [3, 4]]);
  });

  it("falls back to the legacy overview_polyline.points object", () => {
    const pts = routePath({ overview_polyline: { points: ENCODED } });
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(38.5, 4);
  });

  it("falls back to overview_polyline as a bare encoded string", () => {
    const pts = routePath({ overview_polyline: ENCODED });
    expect(pts).toHaveLength(2);
    expect(pts[1][0]).toBeCloseTo(40.7, 4);
  });

  it("REGRESSION: an overview_polyline with no `points` returns [] rather than throwing", () => {
    // The exact prod shape that broke it. It must degrade to "no route", never throw — a throw
    // inside the Directions callback silently kills the callback and the map falls back to a
    // straight line with nothing logged.
    expect(() => routePath({ overview_polyline: {} })).not.toThrow();
    expect(routePath({ overview_polyline: {} })).toEqual([]);
    expect(routePath({})).toEqual([]);
    expect(routePath(undefined)).toEqual([]);
  });

  it("prefers overview_path over a stale encoded polyline when both exist", () => {
    const route = {
      overview_path: [{ lat: () => 1, lng: () => 2 }, { lat: () => 3, lng: () => 4 }],
      overview_polyline: { points: ENCODED },
    };
    expect(routePath(route)).toEqual([[1, 2], [3, 4]]);
  });

  it("drops malformed points instead of emitting NaN coordinates into Leaflet", () => {
    const route = {
      overview_path: [
        { lat: () => 43.6, lng: () => -79.3 },
        { lat: () => undefined, lng: () => undefined },
      ],
    };
    expect(routePath(route)).toEqual([[43.6, -79.3]]);
  });
});
