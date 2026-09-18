import { geoArea } from "d3-geo";
import { distance, within, type Region } from "./model";
import { geometryAt as timelineGeometryAt } from "./timeline";
export type FireGeometry = {
  type: "Point" | "Polygon";
  coordinates: number[] | number[][][];
  date: string;
  precision: "day" | "second";
};
export type Incident = {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  closed: string | null;
  status: "open" | "closed";
  agency?: string;
  areaHectares?: number;
  percentContained?: number;
  controlStatus?: string;
  statusDate?: string;
  sources: { id: string; url: string }[];
  geometry: FireGeometry[];
};
export type Detection = {
  id: string;
  acquisition: string;
  precision: "minute";
  longitude: number;
  latitude: number;
  satellite: string;
  instrument: string;
  product: string;
  version: string;
  confidence: "low" | "nominal" | "high";
  dayNight: string;
  brightI4: number | null;
  brightI5: number | null;
  frp: number | null;
  scan: number | null;
  track: number | null;
};
export type FireQuery = Omit<Region, "name"> & { start: string; days: number };
export type FireSnapshot = {
  id: string;
  schema: number;
  provider: "eonet" | "firms" | "cwfis" | "cwfis-active";
  product: string;
  query: string;
  fetched: string;
  state:
    | "ready"
    | "empty"
    | "stale"
    | "partial"
    | "failed"
    | "unconfigured"
    | "demo";
  complete: boolean;
  demo: boolean;
  error?: string;
  coverage?: FireQuery;
  incidents: Incident[];
  detections: Detection[];
  sources: { id: string; url: string }[];
};
export type RenderObject = {
  id: string;
  title: string;
  kind: "incident" | "detection";
  geometry: FireGeometry | { type: "Point"; coordinates: number[] };
  time: string;
};
export function geometryAt(incident: Incident, cursor: number): FireGeometry[] {
  return timelineGeometryAt(incident.geometry, cursor);
}
export function detectionsAt(ds: Detection[], cursor: number, hours: number) {
  return ds.filter((d) => {
    const t = Date.parse(d.acquisition);
    return (
      t <= cursor && (!Number.isFinite(cursor) || t > cursor - hours * 3600000)
    );
  });
}
export function nearby(
  ds: Detection[],
  point: [number, number],
  radius: number,
  start: number,
  end: number,
) {
  return ds.filter(
    (d) =>
      distance(point, [d.longitude, d.latitude]) <= radius &&
      Date.parse(d.acquisition) >= start &&
      Date.parse(d.acquisition) <= end,
  );
}
export function filterDetections(
  ds: Detection[],
  cursor: number,
  hours: number,
  region: Region | null,
  confidence: string,
) {
  return detectionsAt(ds, cursor, hours).filter(
    (d) =>
      (!region || within(d.longitude, d.latitude, region)) &&
      (!confidence || d.confidence === confidence),
  );
}
export function globeGeometry(g: FireGeometry): FireGeometry {
  if (g.type !== "Polygon" || geoArea(g as any) <= 2 * Math.PI) return g;
  return {
    ...g,
    coordinates: (g.coordinates as number[][][]).map((r) => [...r].reverse()),
  };
}
export function fireObjects(
  incidents: Incident[],
  detections: Detection[],
  cursor: number,
): RenderObject[] {
  return [
    ...incidents.flatMap((i) =>
      geometryAt(i, cursor).map((g, index) => ({
        id: i.id + "@" + index,
        title: i.title,
        kind: "incident" as const,
        geometry: globeGeometry(g),
        time: g.date,
      })),
    ),
    ...detections.map((d) => ({
      id: d.id,
      title: "Satellite thermal detection",
      kind: "detection" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [d.longitude, d.latitude],
      },
      time: d.acquisition,
    })),
  ];
}
export function safeSource(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
export const fireSources = [
  {
    title: "NASA EONET v3",
    url: "https://eonet.gsfc.nasa.gov/docs/v3",
    body: "Curated records, original source links and dated geometry. Open and closed are provider statuses.",
  },
  {
    title: "NASA FIRMS Area API",
    url: "https://firms.modaps.eosdis.nasa.gov/api/area/",
    body: "Bounded VIIRS_NOAA20_NRT detections. The local server holds the MAP_KEY.",
  },
  {
    title: "NASA FIRMS global active-fire data",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    body: "Global near-real-time active-fire products from MODIS and VIIRS; this dashboard requests bounded areas to keep retrieval reviewable.",
  },
  {
    title: "NASA FIRMS science guidance",
    url: "https://www.earthdata.nasa.gov/data/tools/firms/faq",
    body: "Thermal anomalies, sensor sampling, confidence, fire radiative power and observation limitations.",
  },
  {
    title: "NOAA-20 VIIRS product",
    url: "https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2",
    body: "VIIRS I-band active-fire product, 375 m nominal resolution; NRT is not a research archive.",
  },
  {
    title: "Natural Resources Canada CWFIS",
    url: "https://cwfis.cfs.nrcan.gc.ca/",
    body: "Canada-wide reported fires, Fire M3 satellite hotspots, perimeter estimates, fire-weather layers and downloadable services.",
  },
  {
    title: "CWFIS Active Wildland Fires",
    url: "https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=public:cwfif_national_activefires&outputFormat=application/json",
    body: "Agency-reported active fire locations from provinces, territories and Parks Canada. Status, size and containment are provider fields; coverage is not complete national incident reporting.",
  },
  {
    title: "CWFIS GeoServer data services",
    url: "https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/references/cwfif/cwfis-data-placemat.pdf",
    body: "Official WMS/WFS/WCS catalogue for active fires, reported fires, hotspots, perimeter estimates and National Fire Database layers.",
  },
  {
    title: "Copernicus EFFIS",
    url: "https://forest-fire.emergency.copernicus.eu/applications/data-and-services",
    body: "European, Middle Eastern and North African active-fire, burnt-area, fire-danger and severity products via free web services.",
  },
  {
    title: "Copernicus EMS / EWDS",
    url: "https://ewds.climate.copernicus.eu/",
    body: "Historical and forecast forest-fire information at European and global level; account access may be required for downloads.",
  },
];
export const fireLessons = [
  {
    title: "Incident versus detection",
    question: "Why do incident and detection counts differ?",
    steps: [
      "Notice the curated incident count. Toggle incident locations off and on.",
      "Change to detections and select a square from the list.",
      "Compare the two source scopes, then explain why a detection is not a new incident.",
    ],
    explain:
      "These frozen datasets have different geographic and temporal coverage. EONET identifies curated incidents; FIRMS records pixels with thermal anomalies. Neither a count difference nor proximity establishes incident membership.",
    source: 0,
  },
  {
    title: "How satellites observe heat",
    question: "What does a satellite actually measure?",
    steps: [
      "Notice an acquisition time by selecting a detection.",
      "Change the confidence filter and compare the remaining count.",
      "Inspect brightness temperature and fire radiative power, then explain why neither measures burned area.",
    ],
    explain:
      "VIIRS confidence describes detection quality, not containment or impact. Brightness temperatures are in kelvin; fire radiative power is in megawatts. Clouds, canopy, viewing geometry and overpass timing can hide heat sources.",
    source: 2,
  },
  {
    title: "Read a sequence of observations",
    question: "What can a sequence of points establish?",
    steps: [
      "Notice the frozen acquisition interval. Restart the timeline.",
      "Change the cursor and compare the detections in the trailing window.",
      "Seek backward, then explain why no spreading perimeter is drawn.",
    ],
    explain:
      "Points document heat observations during satellite sampling. Missing detections do not prove absence. A sequence does not supply a burned-area boundary or fire-spread model. Replay uses current archived records, not historical knowledge at the time.",
    source: 2,
  },
];
