// Outline icon path data vendored from Tabler Icons (MIT License,
// https://tabler.io/icons, https://github.com/tabler/tabler-icons).
// Each entry is Tabler's 24x24-viewBox stroke path(s) for one glyph,
// joined into a single `d` string (safe: every subpath starts with its
// own "M"), for use as `new Path2D(d)` stroked at whatever size the
// caller scales its canvas context to. The invisible 24x24 hit-area
// background path Tabler includes in every icon (stroke="none") is
// dropped since nothing here fills a background via the icon itself.
import type { HazardCategory } from "./hazards";

export const HAZARD_ICON_SOURCE: Record<HazardCategory, string> = {
  // mountain
  volcanoes:
    "M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612 M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2",
  // tornado
  severeStorms: "M21 4l-18 0 M13 16l-6 0 M11 20l4 0 M6 8l14 0 M4 12l12 0",
  // ripple
  floods:
    "M3 7c3 -2 6 -2 9 0s6 2 9 0 M3 17c3 -2 6 -2 9 0s6 2 9 0 M3 12c3 -2 6 -2 9 0s6 2 9 0",
  // triangle
  landslides:
    "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0",
  // droplet-off
  drought:
    "M18.963 14.938a6.54 6.54 0 0 0 -.899 -4.06l-4.89 -7.26c-.42 -.626 -1.287 -.804 -1.936 -.398a1.376 1.376 0 0 0 -.41 .397l-1.282 1.9m-1.625 2.415l-1.986 2.946c-1.695 2.837 -1.035 6.44 1.567 8.545c2.602 2.105 6.395 2.105 8.996 0a6.83 6.83 0 0 0 1.376 -1.499 M3 3l18 18",
  // wind
  dustHaze:
    "M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24 M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24 M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24",
  // snowflake
  seaLakeIce:
    "M10 4l2 1l2 -1 M12 2v6.5l3 1.72 M17.928 6.268l.134 2.232l1.866 1.232 M20.66 7l-5.629 3.25l.01 3.458 M19.928 14.268l-1.866 1.232l-.134 2.232 M20.66 17l-5.629 -3.25l-2.99 1.738 M14 20l-2 -1l-2 1 M12 22v-6.5l-3 -1.72 M6.072 17.732l-.134 -2.232l-1.866 -1.232 M3.34 17l5.629 -3.25l-.01 -3.458 M4.072 9.732l1.866 -1.232l.134 -2.232 M3.34 7l5.629 3.25l2.99 -1.738",
  // cloud-snow
  snow: "M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7 M11 15v.01m0 3v.01m0 3v.01m4 -4v.01m0 3v.01",
  // temperature
  tempExtremes: "M10 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5 M10 9l4 0",
  // droplet
  waterColor:
    "M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546",
  // building-factory
  manmade:
    "M4 21c1.147 -4.02 1.983 -8.027 2 -12h6c.017 3.973 .853 7.98 2 12 M12.5 13h4.5c.025 2.612 .894 5.296 2 8 M9 5a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1 M3 21l19 0",
};

const cache = new Map<HazardCategory, Path2D>();
export function hazardIconPath(category: HazardCategory): Path2D {
  let path = cache.get(category);
  if (!path) {
    path = new Path2D(HAZARD_ICON_SOURCE[category]);
    cache.set(category, path);
  }
  return path;
}

// The reference legend covers all 13 EONET categories from the original
// spec, including wildfires (flame) and earthquakes (activity) — those two
// still render with their own existing markers (a canvas sprite and a
// depth-colored circle, respectively), not this Path2D system, but the
// legend documents the intended glyph for every category regardless of
// which renderer currently draws it.
export const HAZARD_LEGEND: { id: string; title: string; d: string }[] = [
  {
    id: "wildfires",
    title: "Wildfires",
    d: "M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235",
  },
  { id: "volcanoes", title: "Volcanoes", d: HAZARD_ICON_SOURCE.volcanoes },
  {
    id: "severeStorms",
    title: "Severe storms",
    d: HAZARD_ICON_SOURCE.severeStorms,
  },
  { id: "floods", title: "Floods", d: HAZARD_ICON_SOURCE.floods },
  { id: "earthquakes", title: "Earthquakes", d: "M3 12h4l3 8l4 -16l3 8h4" },
  { id: "landslides", title: "Landslides", d: HAZARD_ICON_SOURCE.landslides },
  { id: "drought", title: "Drought", d: HAZARD_ICON_SOURCE.drought },
  { id: "dustHaze", title: "Dust and haze", d: HAZARD_ICON_SOURCE.dustHaze },
  {
    id: "seaLakeIce",
    title: "Sea and lake ice",
    d: HAZARD_ICON_SOURCE.seaLakeIce,
  },
  { id: "snow", title: "Snow", d: HAZARD_ICON_SOURCE.snow },
  {
    id: "tempExtremes",
    title: "Temperature extremes",
    d: HAZARD_ICON_SOURCE.tempExtremes,
  },
  { id: "waterColor", title: "Water color", d: HAZARD_ICON_SOURCE.waterColor },
  { id: "manmade", title: "Manmade", d: HAZARD_ICON_SOURCE.manmade },
];
