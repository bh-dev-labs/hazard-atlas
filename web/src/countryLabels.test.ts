import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import {
  countryLabels,
  countryLabelVisible,
  snapToPixel,
} from "./countryLabels";

const geography = JSON.parse(
  readFileSync(new URL("../public/data/earth.json", import.meta.url), "utf8"),
);
const labels = countryLabels(
  feature(
    geography,
    geography.objects.countries,
  ) as unknown as FeatureCollection,
);

test("country names come from bundled geography with mainland anchors", () => {
  assert.ok(labels.length > 170);
  for (const name of ["Canada", "Japan", "France"]) {
    assert.ok(labels.some((country) => country.name === name));
  }
  const france = labels.find((country) => country.name === "France")!;
  assert.ok(france.coordinate[0] > -5 && france.coordinate[0] < 10);
  assert.ok(france.coordinate[1] > 40 && france.coordinate[1] < 52);
  assert.ok(
    labels.every((country) => country.coordinate.every(Number.isFinite)),
  );
  assert.ok(
    labels.every(
      (country, index) => index === 0 || labels[index - 1].area >= country.area,
    ),
  );
});

test("country labels hide the far side of the globe but remain available on the flat map", () => {
  const japan = labels.find((country) => country.name === "Japan")!;
  assert.equal(countryLabelVisible(japan, [140, 35], false), true);
  assert.equal(countryLabelVisible(japan, [-40, -35], false), false);
  assert.equal(countryLabelVisible(japan, [-40, -35], true), true);
});

test("labels hold a whole device pixel instead of shimmering under rotation", () => {
  assert.equal(snapToPixel(354.97, 2), 355);
  assert.equal(snapToPixel(354.7, 2), 354.5);
  assert.equal(snapToPixel(354.9, 1), 355);
  // Australia drifts about 0.2px per frame at the default rotation speed;
  // snapped, its position repeats until it has earned a full device pixel.
  const positions = Array.from({ length: 6 }, (_, frame) =>
    snapToPixel(354.97 - frame * 0.206, 2),
  );
  assert.equal(new Set(positions).size, 3);
  assert.deepEqual(positions.slice(0, 4), [355, 355, 354.5, 354.5]);
});
