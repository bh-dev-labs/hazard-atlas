import { test } from "node:test";
import assert from "node:assert/strict";
import { activeAt, markersAt, type HazardRecord } from "./hazards";

const track: HazardRecord = {
  id: "eonet:cyclone",
  category: "severeStorms",
  title: "Demo Cyclone",
  geometry: [
    {
      date: "2026-09-01",
      type: "Point",
      coordinates: [140, 12],
      precision: "day",
      magnitudeValue: 65,
      magnitudeUnit: "kts",
    },
    {
      date: "2026-09-02",
      type: "Point",
      coordinates: [138.5, 14.2],
      precision: "day",
      magnitudeValue: 80,
      magnitudeUnit: "kts",
    },
    {
      date: "2026-09-03",
      type: "Point",
      coordinates: [136, 17],
      precision: "day",
      magnitudeValue: 95,
      magnitudeUnit: "kts",
    },
  ],
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  closed: false,
  alertLevel: "red",
  severityText: "Wind speed 95 kts",
  sourceUrls: [],
};
const flood: HazardRecord = {
  id: "eonet:flood",
  category: "floods",
  title: "Demo Flood",
  geometry: [
    {
      date: "2026-09-01",
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      precision: "day",
      magnitudeValue: null,
      magnitudeUnit: null,
    },
  ],
  startDate: "2026-09-01",
  endDate: "2026-09-05",
  closed: true,
  alertLevel: "unknown",
  severityText: "",
  sourceUrls: [],
};

test("activeAt respects an open record's unbounded end and a closed record's end date", () => {
  assert.equal(activeAt(track, Date.parse("2026-08-31")), false);
  assert.equal(activeAt(track, Date.parse("2026-09-05")), true);
  assert.equal(activeAt(flood, Date.parse("2026-09-04")), true);
  assert.equal(activeAt(flood, Date.parse("2026-09-06")), false);
});
test("markersAt tracks the cyclone to its latest point and trails the earlier ones", () => {
  const before = markersAt([track], Date.parse("2026-09-01T12:00:00Z"));
  assert.equal(before.length, 1);
  assert.deepEqual(before[0].geometry.coordinates, [140, 12]);
  assert.equal(before[0].trail.length, 0);

  const later = markersAt([track], Date.parse("2026-09-04"));
  assert.equal(later.length, 1);
  assert.deepEqual(later[0].geometry.coordinates, [136, 17]);
  assert.equal(later[0].trail.length, 2);
  assert.deepEqual(later[0].trail[0].coordinates, [140, 12]);
});
test("markersAt keeps a Polygon hazard's own extent instead of dropping it", () => {
  const markers = markersAt([flood], Date.parse("2026-09-02"));
  assert.equal(markers.length, 1);
  assert.equal(markers[0].geometry.type, "Polygon");
  assert.equal(markers[0].trail.length, 0);
});
test("markersAt drops hazards outside their active window", () => {
  assert.equal(markersAt([flood], Date.parse("2026-08-01")).length, 0);
  assert.equal(markersAt([track, flood], Date.parse("2026-09-02")).length, 2);
});
