import { geometryAt as timelineGeometryAt } from "./timeline";

// Every EONET category this app renders through internal/hazards, i.e. every
// category except "wildfires" (its own dedicated pipeline in wildfire.ts) and
// "earthquakes" (USGS stays the sole source; EONET's earthquakes category is
// discarded server-side).
export const HAZARD_CATEGORIES = [
  "volcanoes",
  "severeStorms",
  "floods",
  "landslides",
  "drought",
  "dustHaze",
  "seaLakeIce",
  "snow",
  "tempExtremes",
  "waterColor",
  "manmade",
] as const;
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];
export type AlertLevel = "red" | "orange" | "green" | "unknown";
// Category and severity are independently legible: this order is only for
// picking a cluster badge color, never for implying one encodes the other.
export const SEVERITY_RANK: Record<AlertLevel, number> = {
  red: 3,
  orange: 2,
  green: 1,
  unknown: 0,
};
export type HazardGeometry = {
  date: string;
  type: "Point" | "Polygon";
  coordinates: number[] | number[][][];
  precision: "day" | "second";
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
};
export type HazardRecord = {
  id: string;
  category: HazardCategory;
  title: string;
  geometry: HazardGeometry[];
  startDate: string;
  endDate: string;
  closed: boolean;
  alertLevel: AlertLevel;
  severityText: string;
  sourceUrls: string[];
};
export type HazardSnapshot = {
  id: string;
  schema: number;
  product: string;
  query: string;
  fetched: string;
  state: "ready" | "empty" | "stale" | "partial" | "failed" | "demo";
  complete: boolean;
  demo: boolean;
  error?: string;
  records: HazardRecord[];
  sources: { id: string; url: string }[];
};
export function hazardGeometryAt(
  record: HazardRecord,
  cursor: number,
): HazardGeometry[] {
  return timelineGeometryAt(record.geometry, cursor);
}
// A hazard is "active" at the scrub position when the position falls within
// its start/end window. An open (not yet closed) event has no end date to
// bound it, so it stays active from its start through the rest of the
// scrubbable window.
export function activeAt(record: HazardRecord, cursor: number): boolean {
  if (!Number.isFinite(cursor)) return true;
  const start = Date.parse(record.startDate);
  if (cursor < start) return false;
  if (!record.closed) return true;
  return cursor <= Date.parse(record.endDate + "T23:59:59.999Z");
}
// One marker per hazard, positioned at the geometry entry active at the
// scrub cursor (Point or Polygon — a flood or drought extent is as valid a
// "current position" as a cyclone's eye), with the preceding *point* entries
// (if any) carried as a trail for multi-point tracks like cyclones. Globe.tsx
// only needs this shape — it never sees EONET or GDACS.
export type HazardMarker = {
  id: string;
  title: string;
  category: HazardCategory;
  alertLevel: AlertLevel;
  geometry: HazardGeometry;
  trail: HazardGeometry[];
};
export function markersAt(
  records: HazardRecord[],
  cursor: number,
): HazardMarker[] {
  const out: HazardMarker[] = [];
  for (const r of records) {
    if (!activeAt(r, cursor)) continue;
    const seen = hazardGeometryAt(r, cursor);
    const entries = seen.length ? seen : r.geometry.slice(0, 1);
    const geometry = entries[entries.length - 1];
    out.push({
      id: r.id,
      title: r.title,
      category: r.category,
      alertLevel: r.alertLevel,
      geometry,
      trail:
        geometry.type === "Point"
          ? entries.slice(0, -1).filter((g) => g.type === "Point")
          : [],
    });
  }
  return out;
}
