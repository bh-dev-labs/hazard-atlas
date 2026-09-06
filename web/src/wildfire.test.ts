import test from "node:test";
import assert from "node:assert/strict";
import {
  geometryAt,
  detectionsAt,
  nearby,
  filterDetections,
  safeSource,
  type Incident,
  type Detection,
} from "./wildfire";
const detection = (id: string, acquisition: string, lon = 0, lat = 0) =>
  ({
    id,
    acquisition,
    longitude: lon,
    latitude: lat,
    confidence: "nominal",
  }) as Detection;
test("date-only geometry has no fake midnight; backward seek excludes future observations", () => {
  const i = {
    geometry: [
      {
        type: "Point",
        coordinates: [0, 0],
        date: "2026-09-05",
        precision: "day",
      },
      {
        type: "Point",
        coordinates: [1, 1],
        date: "2026-09-06T12:00:00Z",
        precision: "second",
      },
    ],
  } as Incident;
  assert.equal(geometryAt(i, Date.parse("2026-09-05T12:00:00Z")).length, 0);
  assert.equal(geometryAt(i, Date.parse("2026-09-06T00:00:00Z")).length, 1);
  assert.equal(geometryAt(i, Infinity).length, 2);
});
test("detection trailing window is left-exclusive right-inclusive across DST date", () => {
  const a = detection("a", "2026-11-01T05:00:00Z"),
    b = detection("b", "2026-11-01T06:00:00Z"),
    c = detection("c", "2026-11-01T07:00:00Z");
  assert.deepEqual(
    detectionsAt([a, b, c], Date.parse(b.acquisition), 1).map((d) => d.id),
    ["b"],
  );
  assert.equal(detectionsAt([a, b, c], Infinity, 1).length, 3);
});
test("known spherical proximity and antimeridian filtering", () => {
  const ds = [
    detection("a", "2026-09-05T12:00:00Z", 179.9, 0),
    detection("b", "2026-09-05T12:00:00Z", 0, 0),
  ];
  assert.deepEqual(
    nearby(ds, [-179.9, 0], 23, 0, Infinity).map((d) => d.id),
    ["a"],
  );
  assert.equal(nearby(ds, [-179.9, 0], 22, 0, Infinity).length, 0);
  assert.equal(
    filterDetections(
      ds,
      Infinity,
      24,
      { name: "dateline", west: 170, east: -170, south: -10, north: 10 },
      "nominal",
    ).length,
    1,
  );
});
test("external links reject active content", () => {
  assert.equal(safeSource("javascript:alert(1)"), "");
  assert.equal(
    safeSource("https://eonet.gsfc.nasa.gov/"),
    "https://eonet.gsfc.nasa.gov/",
  );
});
import { geoContains } from "d3-geo";
import { globeGeometry } from "./wildfire";
test("source polygon orientation is normalized for the spherical renderer without changing source geometry", () => {
  const original = {
    type: "Polygon" as const,
    coordinates: [
      [
        [179, 0],
        [-179, 0],
        [-179, 2],
        [179, 2],
        [179, 0],
      ],
    ],
    date: "2026-09-05",
    precision: "day" as const,
  };
  const g = globeGeometry(original);
  assert.ok(geoContains(g as any, [180, 1]));
  assert.ok(!geoContains(g as any, [0, 0]));
  assert.deepEqual(original.coordinates[0][1], [-179, 0]);
});
