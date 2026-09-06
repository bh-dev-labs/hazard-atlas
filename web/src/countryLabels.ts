import { geoArea, geoCentroid, geoDistance } from "d3-geo";
import type { FeatureCollection } from "geojson";

export type CountryLabel = {
  name: string;
  coordinate: [number, number];
  area: number;
};

// Natural Earth's formal names run to 150px at label size and lose every
// collision test over a busy region; these are the forms atlases print.
const displayNames: Record<string, string> = {
  "United States of America": "United States",
  "Democratic Republic of the Congo": "DR Congo",
  "United Republic of Tanzania": "Tanzania",
  "Bosnia and Herzegovina": "Bosnia & Herz.",
  "Central African Republic": "Central African Rep.",
};

export function countryLabels(countries: FeatureCollection): CountryLabel[] {
  return countries.features
    .map((country) => {
      const geometry =
        country.geometry.type === "MultiPolygon"
          ? country.geometry.coordinates
              .map((coordinates) => ({ type: "Polygon" as const, coordinates }))
              .sort((first, second) => geoArea(second) - geoArea(first))[0]
          : country.geometry;
      const name = String(country.properties?.name || "");
      return {
        name: displayNames[name] ?? name,
        coordinate: geoCentroid(geometry),
        area: geoArea(geometry),
      };
    })
    .filter(
      (country) => country.name && country.coordinate.every(Number.isFinite),
    )
    .sort((first, second) => second.area - first.area);
}

export function countryLabelVisible(
  country: CountryLabel,
  centre: [number, number],
  flat: boolean,
) {
  return flat || geoDistance(country.coordinate, centre) < Math.PI / 2 - 0.15;
}
