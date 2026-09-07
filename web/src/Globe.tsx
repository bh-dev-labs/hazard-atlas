import { type RenderObject } from "./wildfire";
import { SEVERITY_RANK, type HazardMarker } from "./hazards";
import { hazardIconPath } from "./hazardIcons";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  geoOrthographic,
  geoEquirectangular,
  geoPath,
  geoGraticule10,
  geoContains,
} from "d3-geo";
import { feature } from "topojson-client";
import { parse, type Font } from "opentype.js";
import labelFontUrl from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url";
import type { FeatureCollection } from "geojson";
import { corridorLines } from "./science";
import { type Section } from "./data";
import {
  countryLabels,
  countryLabelOpacity,
  planLabels,
  type CountryLabel,
  type LabelPlan,
} from "./countryLabels";
import {
  color,
  radius,
  refreshPalette,
  token,
  visible,
  type Event,
  type Region,
} from "./model";
export type Camera = { lon: number; lat: number; zoom: number };
type Props = {
  events: Event[];
  objects?: RenderObject[];
  onObject?: (o: RenderObject) => void;
  hazards?: HazardMarker[];
  onHazard?: (m: HazardMarker) => void;
  overview?: boolean;
  selected: string;
  onSelect: (e: Event) => void;
  camera: Camera;
  setCamera: (c: Camera) => void;
  flat: boolean;
  plates: boolean;
  countries: boolean;
  transect: Section;
  region: Region | null;
  section: boolean;
  auto: boolean;
  speed: number;
  pause: () => void;
};
let earthPromise: Promise<any> | null = null,
  platePromise: Promise<any> | null = null;
let labelFontPromise: Promise<Font> | null = null;
export function Globe(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null),
    live = useRef(p);
  live.current = p;
  const [earth, setEarth] = useState<any>(null),
    [countries, setCountries] = useState<CountryLabel[]>([]),
    [labelFont, setLabelFont] = useState<Font | null>(null),
    [plates, setPlates] = useState<any>(null),
    [error, setError] = useState(""),
    [hover, setHover] = useState(""),
    [choices, setChoices] = useState<Event[]>([]),
    [size, setSize] = useState([800, 600]),
    [theme, setTheme] = useState(0),
    [cursor, setCursor] = useState(""),
    [spoken, setSpoken] = useState("");
  const sprites = useRef(new Map<string, HTMLCanvasElement>());
  const spriteStyle = useRef("");
  const objectHits = useRef<
    { o: RenderObject; members?: RenderObject[]; x: number; y: number }[]
  >([]);
  const polygons = useRef<RenderObject[]>([]);
  const hazardHits = useRef<
    {
      title: string;
      x: number;
      y: number;
      marker?: HazardMarker;
      clusterKey?: string;
      members?: HazardMarker[];
    }[]
  >([]);
  const [spiderfied, setSpiderfied] = useState<string | null>(null);
  const labelPlan = useRef<{ key: string; plan: LabelPlan }>({
    key: "",
    plan: [],
  });
  const labelElements = useRef(new Map<string, SVGPathElement>());
  const labelLayer = useRef<SVGSVGElement>(null);
  const markerLayer = useRef<HTMLCanvasElement>(null);
  const labelStyle = useRef("");
  const invert = useRef<
    ((p: [number, number]) => [number, number] | null) | null
  >(null);
  const [objectChoices, setObjectChoices] = useState<RenderObject[]>([]);
  const hits = useRef<{ e: Event; x: number; y: number; r: number }[]>([]);
  const pointers = useRef(new Map<number, [number, number]>());
  const drag = useRef({ x: 0, y: 0, moved: 0, pinch: 0, multi: false });
  useEffect(() => {
    labelFontPromise ??= fetch(labelFontUrl).then(async (response) => {
      if (!response.ok) throw new Error("Label font unavailable");
      return parse(await response.arrayBuffer());
    });
    labelFontPromise.then(setLabelFont).catch(() => setError("Country labels unavailable."));
    earthPromise ??= fetch("/data/earth.json")
      .then((r) => r.json())
      .then((t) => ({
        land: feature(t, t.objects.land),
        countries: countryLabels(
          feature(t, t.objects.countries) as unknown as FeatureCollection,
        ),
      }));
    platePromise ??= fetch("/data/plates.json").then((r) => r.json());
    earthPromise
      .then((geography) => {
        setEarth(geography.land);
        setCountries(geography.countries);
      })
      .catch(() =>
        setError("Geography unavailable. Event list remains usable."),
      );
    platePromise
      .then(setPlates)
      .catch(() => setError("Plate overlay unavailable."));
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const repaint = () => {
      refreshPalette();
      setTheme((n) => n + 1);
    };
    scheme.addEventListener("change", repaint);
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      const width = Math.round(r.width);
      const height = Math.max(120, Math.round(r.height));
      setSize((previous) =>
        previous[0] === width && previous[1] === height
          ? previous
          : [width, height],
      );
    });
    if (ref.current) ro.observe(ref.current.parentElement!);
    return () => {
      ro.disconnect();
      scheme.removeEventListener("change", repaint);
    };
  }, []);
  useEffect(() => {
    if (!p.auto || p.flat) return;
    let frame = 0,
      last = 0;
    const tick = (t: number) => {
      if (!document.hidden) {
        if (last) {
          const q = live.current;
          q.setCamera({
            ...q.camera,
            lon:
              ((q.camera.lon + ((t - last) / 1000) * 3 * q.speed + 540) % 360) -
              180,
          });
        }
        last = t;
      } else last = 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [p.auto, p.speed, p.flat]);
  // A spiderfied cluster is keyed by its screen-grid cell, so once the view
  // moves that key refers to a different patch of screen and would expand
  // whatever unrelated markers now land there. Collapse it on any view change.
  useEffect(() => {
    setSpiderfied(null);
  }, [p.camera, p.flat, size]);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Canvas unavailable. Use the event table below.");
      return;
    }
    let ctx = context;
    const [w, h] = size,
      dpr = devicePixelRatio || 1;
    // A hidden pane (display:none) reports a zero-width content rect. The
    // inline style below overrides the stylesheet's width:100%, so writing
    // it while the size is still zero pins the canvas to 0px until the
    // ResizeObserver catches up -- a visible collapse when a pane is shown
    // again. Leave the last good size in place and skip the frame instead.
    if (w <= 0) return;
    const pixelWidth = Math.round(w * dpr),
      pixelHeight = Math.round(h * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    // Rasterize glyphs and sharp marker edges once, then translate the same
    // image at the exact projected coordinate on every animation frame.
    const style = `${dpr}:${theme}`;
    if (spriteStyle.current !== style) {
      sprites.current.clear();
      spriteStyle.current = style;
    }
    const sprite = (
      key: string,
      width: number,
      height: number,
      paint: (context: CanvasRenderingContext2D) => void,
    ) => {
      let bitmap = sprites.current.get(key);
      if (!bitmap) {
        bitmap = document.createElement("canvas");
        bitmap.width = Math.ceil(width * dpr);
        bitmap.height = Math.ceil(height * dpr);
        const context = bitmap.getContext("2d")!;
        context.scale(dpr, dpr);
        context.translate(bitmap.width / dpr / 2, bitmap.height / dpr / 2);
        paint(context);
        sprites.current.set(key, bitmap);
      }
      return bitmap;
    };
    const drawSprite = (bitmap: HTMLCanvasElement, x: number, y: number) => {
      const width = bitmap.width / dpr,
        height = bitmap.height / dpr;
      ctx.drawImage(bitmap, x - width / 2, y - height / 2, width, height);
    };
    ctx.clearRect(0, 0, w, h);
    const proj = p.flat
      ? geoEquirectangular()
          .rotate([-p.camera.lon, 0, 0])
          .scale((w / 6.5) * p.camera.zoom)
          .translate([w / 2, h / 2])
      : geoOrthographic()
          .rotate([-p.camera.lon, -p.camera.lat, 0])
          .scale(Math.min(w, h) * 0.46 * p.camera.zoom)
          .translate([w / 2, h / 2])
          .clipAngle(90);
    invert.current = proj.invert ? (xy) => proj.invert!(xy) : null;
    let path = geoPath(proj, ctx);
    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.fillStyle = token("--globe-ocean");
    ctx.fill();
    ctx.strokeStyle = token("--globe-edge");
    ctx.stroke();
    if (earth) {
      ctx.beginPath();
      path(earth);
      ctx.fillStyle = token("--globe-land");
      ctx.fill();
    }
    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = token("--globe-graticule");
    ctx.lineWidth = 0.55;
    ctx.stroke();
    if (p.plates && plates) {
      ctx.beginPath();
      path(plates);
      ctx.strokeStyle = token("--plate");
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = "11px sans-serif";
      ctx.fillStyle = token("--plate-label");
      for (const [name, coord] of [
        ["Pacific", [190, 0]],
        ["North American", [-100, 45]],
        ["Eurasian", [65, 45]],
        ["African", [20, 0]],
        ["Antarctic", [20, -70]],
        ["Indo-Australian", [100, -25]],
        ["South American", [-55, -20]],
      ] as [string, [number, number]][]) {
        if (p.flat || visible(coord, [p.camera.lon, p.camera.lat])) {
          const xy = proj(coord);
          if (xy) ctx.fillText(name, xy[0] - 20, xy[1]);
        }
      }
    }
    if (p.region) {
      const r = p.region;
      const lines: any = { type: "MultiLineString", coordinates: [] };
      const east = r.east < r.west ? r.east + 360 : r.east;
      const norm = (x: number) => ((x + 540) % 360) - 180;
      const top = [],
        bottom = [],
        left = [],
        right = [];
      for (let x = r.west; x <= east; x += 1) {
        top.push([norm(x), r.north]);
        bottom.push([norm(x), r.south]);
      }
      for (let y = r.south; y <= r.north; y += 1) {
        left.push([r.west, y]);
        right.push([r.east, y]);
      }
      lines.coordinates = [top, bottom, left, right];
      ctx.beginPath();
      path(lines);
      ctx.strokeStyle = token("--accent");
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.section) {
      const corridor = corridorLines(p.transect);
      ctx.beginPath();
      path({ type: "LineString", coordinates: corridor.coordinates[0] || [] });
      ctx.strokeStyle = token("--ink");
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      path({
        type: "MultiLineString",
        coordinates: corridor.coordinates.slice(1),
      });
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const layer = labelLayer.current!;
    layer.style.width = w + "px";
    layer.style.height = h + "px";
    layer.style.display = p.countries ? "block" : "none";
    if (labelStyle.current !== style) {
      layer.replaceChildren();
      labelElements.current.clear();
      labelStyle.current = style;
    }
    if (p.countries && labelFont) {
      const key = [countries.length, w, h, p.camera.zoom, p.flat].join();
      if (labelPlan.current.key !== key) {
        labelPlan.current = {
          key,
          plan: planLabels(
            countries,
            (name, size) => labelFont.getAdvanceWidth(name, size),
            proj.scale(),
            p.camera.zoom,
          ),
        };
      }
      for (const { label, size, opacity } of labelPlan.current.plan) {
        const alpha =
          opacity *
          countryLabelOpacity(label, [p.camera.lon, p.camera.lat], p.flat);
        const point = proj(label.coordinate);
        const labelKey = [label.name, size].join();
        let glyph = labelElements.current.get(labelKey);
        if (alpha <= 0 || !point) {
          if (glyph) glyph.style.opacity = "0";
          continue;
        }
        if (!glyph) {
          const outline = labelFont.getPath(label.name, 0, 0, size);
          const bounds = outline.getBoundingBox();
          const d = labelFont.getPath(label.name, -(bounds.x1 + bounds.x2) / 2, -(bounds.y1 + bounds.y2) / 2, size).toPathData(4);
          glyph = document.createElementNS("http://www.w3.org/2000/svg", "path");
          glyph.dataset.country = label.name;
          glyph.dataset.fontSize = String(size);
          glyph.setAttribute("d", d);
          glyph.setAttribute("fill", token("--ink-strong"));
          labelElements.current.set(labelKey, glyph);
          layer.append(glyph);
        }
        // Snap to a quarter device pixel: fine enough that the jump between
        // steps is imperceptible, but coarse enough to damp the flicker from
        // re-rasterizing anti-aliased glyph edges at an arbitrary subpixel
        // phase every frame.
        const grid = dpr * 4,
          left = Math.round(point[0] * grid) / grid,
          top = Math.round(point[1] * grid) / grid;
        glyph.setAttribute("transform", `translate(${left}, ${top})`);
        glyph.style.opacity = String(alpha);
      }
    }
    const markers = markerLayer.current!;
    if (markers.width !== pixelWidth) markers.width = pixelWidth;
    if (markers.height !== pixelHeight) markers.height = pixelHeight;
    markers.style.width = w + "px";
    markers.style.height = h + "px";
    ctx = markers.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    path = geoPath(proj, ctx);
    hits.current = [];
    const ordered = [
      ...p.events.filter((e) => e.id !== p.selected),
      ...p.events.filter((e) => e.id === p.selected),
    ];
    for (const e of ordered) {
      const [lon, lat, depth] = e.geometry.coordinates;
      if (!p.flat && !visible([lon, lat], [p.camera.lon, p.camera.lat]))
        continue;
      const xy = proj([lon, lat]);
      if (!xy) continue;
      const [x, y] = xy;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const r = p.overview ? 4 : radius(e.properties.mag);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.overview ? "#246f87" : color(depth);
      ctx.globalAlpha = p.selected && e.id !== p.selected ? 0.75 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = token("--marker-edge");
      ctx.lineWidth = 1;
      ctx.stroke();
      if (e.id === p.selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = token("--ink");
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (e.id === cursor && e.id !== p.selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = token("--accent");
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      hits.current.push({ e, x, y, r });
    }
    objectHits.current = [];
    polygons.current = [];
    const clustered = new Map<
      string,
      { o: RenderObject; members: RenderObject[]; x: number; y: number }
    >();
    for (const o of p.objects || []) {
      ctx.fillStyle = o.kind === "incident" ? "#ac3c20" : "#973f92";
      ctx.strokeStyle = token("--marker-edge");
      ctx.lineWidth = 1;
      if (o.geometry.type === "Polygon") {
        ctx.beginPath();
        path(o.geometry as any);
        ctx.globalAlpha = 0.24;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#ac3c20";
        ctx.lineWidth = 2;
        ctx.stroke();
        polygons.current.push(o);
        continue;
      }
      const [lon, lat] = o.geometry.coordinates as number[];
      if (!p.flat && !visible([lon, lat], [p.camera.lon, p.camera.lat]))
        continue;
      const xy = proj([lon, lat]);
      if (!xy) continue;
      // Straight-edged incident/detection markers show subpixel drift as a
      // shimmer under rotation, and jitter across the cluster grid below.
      // Snap to a quarter device pixel: fine enough that the jump between
      // steps is imperceptible (whole-pixel snapping shows a visible bounce),
      // but coarse enough to damp the flicker, like the labels.
      const markerGrid = dpr * 4,
        x = Math.round(xy[0] * markerGrid) / markerGrid,
        y = Math.round(xy[1] * markerGrid) / markerGrid;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      if (o.kind === "detection" && (p.objects?.length || 0) > 2000) {
        const key = Math.floor(x / 18) + "," + Math.floor(y / 18);
        const cluster = clustered.get(key);
        if (cluster) cluster.members.push(o);
        else clustered.set(key, { o, members: [o], x, y });
        continue;
      }
      const bitmap = sprite(o.kind, 18, 18, (context) => {
        context.fillStyle = o.kind === "incident" ? "#ac3c20" : "#973f92";
        context.strokeStyle = token("--marker-edge");
        context.lineWidth = 1;
        context.beginPath();
        if (o.kind === "incident") {
          context.moveTo(0, -7);
          context.lineTo(6, 5);
          context.lineTo(-6, 5);
          context.closePath();
        } else {
          context.rect(-3, -3, 6, 6);
        }
        context.fill();
        context.stroke();
      });
      drawSprite(bitmap, x, y);
      if (o.id === p.selected || o.id.split("@")[0] === p.selected) {
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = token("--ink");
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      objectHits.current.push({ o, x, y });
    }
    for (const cluster of clustered.values()) {
      const { x, y, members } = cluster;
      ctx.fillStyle = "#973f92";
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.strokeStyle = token("--marker-edge");
      ctx.strokeRect(x - 6, y - 6, 12, 12);
      if (members.length > 1) {
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = token("--ink");
        ctx.fillText(String(members.length), x + 7, y + 3);
      }
      objectHits.current.push(cluster);
    }
    hazardHits.current = [];
    const hazardGlyph = (m: HazardMarker, x: number, y: number) => {
      const bitmap = sprite(
        `hazard:${m.category}:${m.alertLevel}`,
        22,
        22,
        (context) => {
          context.beginPath();
          context.arc(0, 0, 10, 0, Math.PI * 2);
          context.fillStyle = token(`--severity-${m.alertLevel}-plate`);
          context.fill();
          context.strokeStyle = token("--marker-edge");
          context.lineWidth = 1;
          context.stroke();
          const scale = 13 / 24;
          context.save();
          context.translate(-12 * scale, -12 * scale);
          context.scale(scale, scale);
          context.strokeStyle = token(`--severity-${m.alertLevel}-stroke`);
          context.lineWidth = 2 / scale;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.stroke(hazardIconPath(m.category));
          context.restore();
        },
      );
      drawSprite(bitmap, x, y);
    };
    // Bucket by a coarse pixel grid so exactly- or near-overlapping glyphs
    // never silently stack invisibly on top of one another (the prompt's
    // "most common failure mode" for this kind of map) — a bucket with more
    // than one member draws as a single severity-colored count badge, click
    // to spiderfy it into a small ring of its individual members.
    const hazardBuckets = new Map<
      string,
      { x: number; y: number; members: HazardMarker[] }
    >();
    for (const m of p.hazards || []) {
      if (m.geometry.type === "Polygon") {
        ctx.beginPath();
        path(m.geometry as any);
        ctx.fillStyle = token(`--severity-${m.alertLevel}-plate`);
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = token(`--severity-${m.alertLevel}-stroke`);
        ctx.lineWidth = 2;
        ctx.stroke();
        continue;
      }
      const [lon, lat] = m.geometry.coordinates as number[];
      if (!p.flat && !visible([lon, lat], [p.camera.lon, p.camera.lat]))
        continue;
      const xy = proj([lon, lat]);
      if (!xy) continue;
      const markerGrid = dpr * 4,
        x = Math.round(xy[0] * markerGrid) / markerGrid,
        y = Math.round(xy[1] * markerGrid) / markerGrid;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      if (m.trail.length) {
        // proj() mirrors far-side points onto the visible disc rather than
        // returning null (clipAngle only applies to the path stream), so a
        // track crossing the horizon needs the same visibility check the
        // markers use, or it draws segments to bogus positions.
        ctx.beginPath();
        let drawn = false;
        for (const entry of m.trail) {
          const coordinate = entry.coordinates as [number, number];
          if (!p.flat && !visible(coordinate, [p.camera.lon, p.camera.lat]))
            continue;
          const pt = proj(coordinate);
          if (!pt) continue;
          if (drawn) ctx.lineTo(pt[0], pt[1]);
          else ctx.moveTo(pt[0], pt[1]);
          drawn = true;
        }
        if (drawn) {
          ctx.lineTo(x, y);
          ctx.strokeStyle = token(`--severity-${m.alertLevel}-stroke`);
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      const key = Math.floor(x / 18) + "," + Math.floor(y / 18);
      const bucket = hazardBuckets.get(key);
      if (bucket) bucket.members.push(m);
      else hazardBuckets.set(key, { x, y, members: [m] });
    }
    for (const [key, bucket] of hazardBuckets) {
      const { x, y, members } = bucket;
      if (members.length === 1) {
        hazardGlyph(members[0], x, y);
        hazardHits.current.push({ title: members[0].title, x, y, marker: members[0] });
        continue;
      }
      if (spiderfied === key) {
        const radius = 16;
        members.forEach((m, i) => {
          const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2;
          const sx = x + Math.cos(angle) * radius,
            sy = y + Math.sin(angle) * radius;
          hazardGlyph(m, sx, sy);
          hazardHits.current.push({ title: m.title, x: sx, y: sy, marker: m });
        });
        // The members themselves now sit off-center with no clusterKey (they
        // pick their own record), so without this the center point has no
        // hit target left to click back to regroup.
        hazardHits.current.push({
          title: "Tap to regroup",
          x,
          y,
          clusterKey: key,
        });
        continue;
      }
      const worst = members.reduce((a, b) =>
        SEVERITY_RANK[b.alertLevel] > SEVERITY_RANK[a.alertLevel] ? b : a,
      ).alertLevel;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = token(`--severity-${worst}-plate`);
      ctx.fill();
      ctx.strokeStyle = token(`--severity-${worst}-stroke`);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "bold 10px sans-serif";
      ctx.fillStyle = token(`--severity-${worst}-stroke`);
      ctx.textAlign = "center";
      ctx.fillText(String(members.length), x, y + 3);
      // The context is reused across frames and by the marker/cluster code
      // above, which relies on the default alignment.
      ctx.textAlign = "start";
      hazardHits.current.push({
        title: `${members.length} hazards, tap to separate`,
        x,
        y,
        clusterKey: key,
        members,
      });
    }
  }, [
    earth,
    countries,
    plates,
    p.events,
    p.objects,
    p.hazards,
    p.overview,
    p.selected,
    p.camera,
    p.flat,
    p.plates,
    p.countries,
    p.region,
    p.section,
    p.transect,
    labelFont,
    size,
    theme,
    cursor,
    spiderfied,
  ]);
  const local = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  const announce = (e: Event) =>
    setSpoken(
      `M ${e.properties.mag ?? "unknown"}, ${e.properties.place}, depth ${
        e.geometry.coordinates[2] ?? "unknown"
      } kilometres. Press Enter to open its details.`,
    );
  function step(delta: number) {
    const drawn = hits.current;
    if (!drawn.length) {
      setSpoken("No earthquakes are visible on this side of Earth.");
      return;
    }
    const at = drawn.findIndex((h) => h.e.id === cursor);
    const next = drawn[(at + delta + drawn.length) % drawn.length];
    setCursor(next.e.id);
    announce(next.e);
  }
  function onKeyDown(ev: KeyboardEvent) {
    const q = live.current;
    const keys: Record<string, () => void> = {
      ArrowLeft: () =>
        q.setCamera({
          ...q.camera,
          lon: ((q.camera.lon - 10 + 540) % 360) - 180,
        }),
      ArrowRight: () =>
        q.setCamera({
          ...q.camera,
          lon: ((q.camera.lon + 10 + 540) % 360) - 180,
        }),
      ArrowUp: () =>
        q.setCamera({ ...q.camera, lat: Math.min(85, q.camera.lat + 10) }),
      ArrowDown: () =>
        q.setCamera({ ...q.camera, lat: Math.max(-85, q.camera.lat - 10) }),
      "+": () =>
        q.setCamera({ ...q.camera, zoom: Math.min(2.5, q.camera.zoom + 0.2) }),
      "=": () =>
        q.setCamera({ ...q.camera, zoom: Math.min(2.5, q.camera.zoom + 0.2) }),
      "-": () =>
        q.setCamera({ ...q.camera, zoom: Math.max(0.65, q.camera.zoom - 0.2) }),
    };
    if (keys[ev.key]) {
      ev.preventDefault();
      q.pause();
      keys[ev.key]();
      return;
    }
    if (ev.key === "n" || ev.key === "N") {
      ev.preventDefault();
      q.pause();
      step(ev.shiftKey ? -1 : 1);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      const target = hits.current.find((h) => h.e.id === cursor);
      if (target) {
        ev.preventDefault();
        q.onSelect(target.e);
      }
    }
  }
  const pick = (x: number, y: number) =>
    hits.current
      .filter((h) => Math.hypot(x - h.x, y - h.y) < Math.max(10, h.r + 3))
      .reverse();
  return (
    <div class="canvas-wrap">
      <canvas
        ref={ref}
        role="application"
        aria-label="Interactive Earth. Arrow keys rotate, plus and minus zoom, N steps through the earthquakes in view, Enter opens the one you land on. Every event is also in the table below."
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          p.pause();
          setChoices([]);
          setObjectChoices([]);
          ref.current!.setPointerCapture(e.pointerId);
          const q = local(e);
          pointers.current.set(e.pointerId, q);
          if (pointers.current.size === 1)
            drag.current = {
              x: q[0],
              y: q[1],
              moved: 0,
              pinch: 0,
              multi: false,
            };
          else {
            drag.current.multi = true;
            const a = [...pointers.current.values()];
            drag.current.pinch = Math.hypot(
              a[0][0] - a[1][0],
              a[0][1] - a[1][1],
            );
          }
        }}
        onPointerMove={(e) => {
          const [x, y] = local(e);
          if (pointers.current.has(e.pointerId)) {
            const old = pointers.current.get(e.pointerId)!;
            pointers.current.set(e.pointerId, [x, y]);
            drag.current.moved += Math.hypot(x - old[0], y - old[1]);
            if (pointers.current.size > 1) {
              const a = [...pointers.current.values()],
                d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
              if (drag.current.pinch)
                p.setCamera({
                  ...p.camera,
                  zoom: Math.min(
                    2.5,
                    Math.max(0.65, (p.camera.zoom * d) / drag.current.pinch),
                  ),
                });
              drag.current.pinch = d;
            } else
              p.setCamera({
                ...p.camera,
                lon: ((p.camera.lon - (x - old[0]) * 0.3 + 540) % 360) - 180,
                lat: Math.max(
                  -85,
                  Math.min(85, p.camera.lat + (y - old[1]) * 0.3),
                ),
              });
          } else {
            const object = objectHits.current.find(
              (h) => Math.hypot(x - h.x, y - h.y) < 10,
            );
            const hazard = hazardHits.current.find(
              (h) => Math.hypot(x - h.x, y - h.y) < 10,
            );
            const h = pick(x, y)[0];
            setHover(
              object
                ? `${object.members?.length || 1} detection/location record(s) · ${object.o.title} · ${object.o.time}`
                : hazard
                  ? hazard.title
                  : h
                    ? `M ${h.e.properties.mag ?? "—"} · ${h.e.properties.place} · ${h.e.geometry.coordinates[2] ?? "Unavailable"} km · ${new Date(h.e.properties.time).toISOString()}`
                    : "",
            );
          }
        }}
        onPointerUp={(e) => {
          const [x, y] = local(e);
          pointers.current.delete(e.pointerId);
          if (!drag.current.multi && drag.current.moved < 7) {
            const hazardHit = hazardHits.current.find(
              (h) => Math.hypot(x - h.x, y - h.y) < 10,
            );
            if (hazardHit?.clusterKey) {
              setSpiderfied((k) =>
                k === hazardHit.clusterKey ? null : hazardHit.clusterKey!,
              );
              return;
            }
            if (hazardHit?.marker) {
              p.onHazard?.(hazardHit.marker);
              return;
            }
            if (spiderfied) setSpiderfied(null);
            const h = pick(x, y);
            const objects = objectHits.current
              .filter((h) => Math.hypot(x - h.x, y - h.y) < 10)
              .flatMap((h) => h.members || [h.o]);
            const coord = invert.current?.([x, y]);
            if (
              coord &&
              (p.flat || visible(coord, [p.camera.lon, p.camera.lat]))
            )
              for (const o of polygons.current)
                if (geoContains(o.geometry as any, coord)) objects.push(o);
            if (objects.length + h.length > 1) {
              setObjectChoices(objects);
              setChoices(h.map((v) => v.e));
              return;
            }
            if (objects.length === 1) {
              p.onObject?.(objects[0]);
              return;
            }
            if (h.length === 1) p.onSelect(h[0].e);
            else if (h.length > 1) setChoices(h.map((v) => v.e));
          }
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onWheel={(e) => {
          if (document.activeElement === ref.current || e.ctrlKey) {
            e.preventDefault();
            p.pause();
            p.setCamera({
              ...p.camera,
              zoom: Math.max(
                0.65,
                Math.min(2.5, p.camera.zoom * Math.exp(-e.deltaY * 0.002)),
              ),
            });
          }
        }}
        tabIndex={0}
      />
      <svg
        ref={labelLayer}
        class="country-label-layer"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={markerLayer}
        aria-hidden="true"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      />
      <p class="sr-only" aria-live="polite">
        {spoken}
      </p>
      {hover && (
        <div class="hover" role="tooltip">
          {hover}
        </div>
      )}
      {error && <p role="status">{error}</p>}
      {(choices.length > 0 || objectChoices.length > 0) && (
        <div class="chooser">
          <strong>
            {choices.length + objectChoices.length} overlapping observations
          </strong>
          <button
            onClick={() => {
              setChoices([]);
              setObjectChoices([]);
            }}
          >
            Close chooser
          </button>
          {objectChoices.slice(0, 100).map((o) => (
            <button
              key={o.id}
              onClick={() => {
                p.onObject?.(o);
                setChoices([]);
                setObjectChoices([]);
              }}
            >
              {o.kind}: {o.title} · {o.time}
            </button>
          ))}
          {objectChoices.length > 100 && (
            <p>
              First 100 detections shown. Zoom in or use the detection list to
              inspect every record.
            </p>
          )}
          {choices.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                p.onSelect(e);
                setChoices([]);
              }}
            >
              M {e.properties.mag ?? "—"} · {e.properties.place} ·{" "}
              {new Date(e.properties.time).toISOString()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
