import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import {
  countryLabels,
  countryLabelOpacity,
  countryLabelVisible,
  planLabels,
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
  for (const name of ["Canada", "Japan", "France", "United States"]) {
    assert.ok(labels.some((country) => country.name === name));
  }
  assert.ok(
    !labels.some((country) => country.name === "United States of America"),
  );
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

test("country label plans stay stable while the camera rotates", () => {
  const measure = (name: string, size: number) => name.length * size * 0.55;
  const plan = planLabels(labels, measure, 380, 1).filter(
    (entry) => entry.opacity > 0,
  );
  assert.ok(plan.some((entry) => entry.label.name === "Japan"));
  assert.deepEqual(
    planLabels(labels, measure, 380, 1)
      .filter((entry) => entry.opacity > 0)
      .map((entry) => entry.label.name),
    plan.map((entry) => entry.label.name),
  );
});

test("country labels fade smoothly at the globe limb", () => {
  const japan = labels.find((country) => country.name === "Japan")!;
  assert.equal(countryLabelOpacity(japan, [140, 35], false), 1);
  assert.equal(countryLabelOpacity(japan, [-40, -35], false), 0);
  let previous = 1;
  for (let lon = 140; lon >= -40; lon -= 1) {
    const next = countryLabelOpacity(japan, [lon, 35], false);
    assert.ok(next <= previous + 1e-9);
    assert.ok(previous - next < 0.35);
    previous = next;
  }
});
