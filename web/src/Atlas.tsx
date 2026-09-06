import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { EarthquakeApp } from "./main";
import { Globe, type Camera } from "./Globe";
import { Workspace } from "./Workspace";
import { sources } from "./content";
import { csvCell, download, type Dataset, type Event } from "./model";
import {
  fireObjects,
  fireSources,
  fireLessons,
  filterDetections,
  geometryAt,
  nearby,
  safeSource,
  type FireSnapshot,
  type FireQuery,
  type Incident,
  type Detection,
  type RenderObject,
} from "./wildfire";
import "./atlas.css";
const emptyEvents: Event[] = [];
const defaultQuery: FireQuery = {
  west: -125,
  south: 30,
  east: -110,
  north: 49,
  start: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  days: 1,
};
const showTime = (s: string) =>
  s.length === 10
    ? s + " (date only)"
    : s.replace("T", " ").replace("Z", " UTC");
const measure = (v: number | null | undefined, unit: string) =>
  v == null ? "Unavailable" : v + " " + unit;
type Selected =
  | { kind: "incident"; value: Incident }
  | { kind: "detection"; value: Detection }
  | { kind: "earthquake"; value: Event };
function FireExplorer(p: {
  overview: boolean;
  learn: boolean;
  active: boolean;
  onEarthquake: () => void;
}) {
  const [inc, setInc] = useState<FireSnapshot | null>(null),
    [det, setDet] = useState<FireSnapshot | null>(null),
    [canada, setCanada] = useState<FireSnapshot | null>(null),
    [eq, setEq] = useState<Dataset | null>(null);
  const [camera, setCamera] = useState<Camera>({ lon: -115, lat: 38, zoom: 1 }),
    [selected, setSelected] = useState<Selected | null>(null),
    [query, setQuery] = useState(defaultQuery);
  const [fireStart, setFireStart] = useState("2026-09-01"),
    [fireEnd, setFireEnd] = useState("2026-09-05");
  const [incLayer, setIncLayer] = useState(true),
    [detLayer, setDetLayer] = useState(true),
    [eqLayer, setEqLayer] = useState(true),
    [flat, setFlat] = useState(false),
    [auto, setAuto] = useState(false),
    [wanted, setWanted] = useState(false),
    [speed, setSpeed] = useState(1);
  const [cursor, setCursor] = useState(Infinity),
    [hours, setHours] = useState(24),
    [playing, setPlaying] = useState(false),
    [confidence, setConfidence] = useState(""),
    [text, setText] = useState(""),
    [list, setList] = useState("incidents"),
    [page, setPage] = useState(0);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [lesson, setLesson] = useState(-1),
    [step, setStep] = useState(0),
    [radius, setRadius] = useState(100),
    [proximity, setProximity] = useState(false);
  const saved = useRef<any>(null),
    request = useRef(0),
    details = useRef<HTMLHeadingElement>(null);
  const pause = () => {
    setAuto(false);
    setPlaying(false);
  };
  useEffect(() => {
    if (!p.active) {
      pause();
      return;
    }
    if (wanted && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAuto(true);
    }
    if (p.learn)
      window.dispatchEvent(new window.Event("hazard-atlas-selection"));
  }, [p.active, p.learn]);
  async function load(
    provider: "eonet" | "firms" | "cwfis",
    demo: boolean,
    q = query,
  ) {
    const ticket = ++request.current;
    setBusy(provider);
    setMessage("");
    pause();
    try {
      const url = demo
        ? "/api/wildfires/" + provider + "?demo=true"
        : provider === "eonet"
          ? "/api/wildfires/eonet?start=" + fireStart + "&end=" + fireEnd
          : "/api/wildfires/" +
            provider +
            "?query=" +
            encodeURIComponent(
              JSON.stringify({ ...q, start: fireStart, end: fireEnd }),
            );
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Provider retrieval failed");
      if (ticket !== request.current) return;
      if (provider === "eonet") setInc(d);
      else if (provider === "cwfis") setCanada(d);
      else setDet(d);
      setCursor(Infinity);
      setProximity(false);
    } catch (e) {
      setMessage(String(e));
    } finally {
      if (ticket === request.current) setBusy("");
    }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then(async (cfg) => {
        const [a, b, c, ca] = await Promise.all([
          fetch("/api/wildfires/eonet" + (cfg.demo ? "?demo=true" : "")),
          fetch(
            "/api/wildfires/firms?" +
              (cfg.demo
                ? "demo=true"
                : "query=" + encodeURIComponent(JSON.stringify(defaultQuery))),
          ),
          fetch(cfg.demo ? "/api/demo" : "/api/recent?period=day"),
          fetch("/api/wildfires/cwfis" + (cfg.demo ? "?demo=true" : "")),
        ]);
        const [i, d, e, canda] = await Promise.all([
          a.json(),
          b.json(),
          c.json(),
          ca.json(),
        ]);
        if (active) {
          setInc(i);
          setDet(d);
          setCanada(canda);
          if (c.ok) setEq(e);
          else setMessage("USGS unavailable: " + e.error);
        }
      })
      .catch((e) => setMessage(String(e)));
    return () => {
      active = false;
    };
  }, []);
  const allDet = useMemo(
    () => [...(det?.detections || []), ...(canada?.detections || [])],
    [det, canada],
  );
  const times = useMemo(
    () => allDet.map((d) => Date.parse(d.acquisition)),
    [allDet],
  );
  const lo = times.length ? Math.min(...times) : 0,
    hi = times.length ? Math.max(...times) : 0;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((c) => {
          const next = (Number.isFinite(c) ? c : lo) + (hi - lo) / 100;
          if (next >= hi) {
            setPlaying(false);
            return hi;
          }
          return next;
        }),
      120,
    );
    return () => clearInterval(timer);
  }, [playing, lo, hi]);
  const incidents = useMemo(
    () =>
      (inc?.incidents || []).filter(
        (i) =>
          i.title.toLowerCase().includes(text.toLowerCase()) &&
          geometryAt(i, cursor).some((g) => {
            const t = Date.parse(
              g.date.length === 10 ? g.date + "T12:00:00Z" : g.date,
            );
            return (
              t >= Date.parse(fireStart + "T00:00:00Z") &&
              t <= Date.parse(fireEnd + "T23:59:59.999Z")
            );
          }) &&
          geometryAt(i, cursor).length > 0,
      ),
    [inc, text, cursor, fireStart, fireEnd],
  );
  const detections = useMemo(() => {
    let ds = filterDetections(allDet, cursor, hours, null, confidence).filter(
      (d) => {
        const t = Date.parse(d.acquisition);
        return (
          t >= Date.parse(fireStart + "T00:00:00Z") &&
          t <= Date.parse(fireEnd + "T23:59:59.999Z")
        );
      },
    );
    if (proximity && selected?.kind === "incident") {
      const g = [...selected.value.geometry]
        .reverse()
        .find((g) => g.type === "Point");
      if (g)
        ds = nearby(
          ds,
          g.coordinates as [number, number],
          radius,
          Date.parse(query.start + "T00:00:00Z"),
          Date.parse(query.start + "T00:00:00Z") + query.days * 86400000 - 1,
        );
    }
    return ds;
  }, [
    allDet,
    cursor,
    hours,
    confidence,
    proximity,
    selected,
    radius,
    query,
    fireStart,
    fireEnd,
  ]);
  const objects = useMemo(
    () =>
      fireObjects(
        incLayer ? incidents : [],
        detLayer ? detections : [],
        cursor,
      ),
    [incLayer, detLayer, incidents, detections, cursor],
  );
  const earthquakes = useMemo(
    () =>
      p.overview && eqLayer
        ? (eq?.data.features || []).filter(
            (e) => e.properties.type === "earthquake",
          )
        : emptyEvents,
    [eq, p.overview, eqLayer],
  );
  function choose(s: Selected) {
    window.dispatchEvent(new window.Event("hazard-atlas-selection"));
    pause();
    setSelected(s);
    requestAnimationFrame(() => details.current?.focus());
  }
  const onObject = (o: RenderObject) => {
    if (o.kind === "incident") {
      const i = inc?.incidents.find((i) => i.id === o.id.split("@")[0]);
      if (i) choose({ kind: "incident", value: i });
    } else {
      const d = allDet.find((d) => d.id === o.id);
      if (d) choose({ kind: "detection", value: d });
    }
  };
  const centreOn = (longitude: number, latitude: number) => {
    pause();
    setCamera({
      lon: longitude,
      lat: latitude,
      zoom: Math.max(camera.zoom, 1.8),
    });
    setFlat(false);
  };
  const currentSelected =
    selected?.kind === "incident"
      ? inc?.incidents.find((i) => i.id === selected.value.id)
      : selected?.kind === "detection"
        ? allDet.find((d) => d.id === selected.value.id)
        : selected?.value;
  const excluded =
    selected?.kind === "incident"
      ? !incidents.some((i) => i.id === selected.value.id)
      : selected?.kind === "detection"
        ? !detections.some((d) => d.id === selected.value.id)
        : false;
  useEffect(() => {
    if (currentSelected && selected && currentSelected !== selected.value)
      setSelected({ ...selected, value: currentSelected } as Selected);
  }, [currentSelected]);
  async function startLesson(n: number) {
    if (!saved.current)
      saved.current = {
        inc,
        det,
        query,
        fireStart,
        fireEnd,
        camera,
        cursor,
        hours,
        confidence,
        text,
        list,
        selected,
        incLayer,
        detLayer,
        eqLayer,
        proximity,
      };
    pause();
    setBusy("lesson");
    try {
      const [a, b] = await Promise.all([
        fetch("/api/wildfires/eonet?demo=true").then((r) => r.json()),
        fetch("/api/wildfires/firms?demo=true").then((r) => r.json()),
      ]);
      setInc(a);
      setDet(b);
      setLesson(n);
      setStep(0);
      setCursor(Infinity);
      setHours(6);
      setConfidence("");
      setText("");
      setProximity(false);
      setSelected(null);
      setIncLayer(true);
      setDetLayer(true);
      setEqLayer(false);
      setList(n === 0 ? "incidents" : "detections");
      setCamera({ lon: -117, lat: 39, zoom: 1.4 });
      setQuery({ ...b.coverage });
      setMessage(
        "Frozen observed datasets loaded. Their scopes differ; no incident association is asserted.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy("");
    }
  }
  function returnView() {
    const v = saved.current;
    if (v) {
      setInc(v.inc);
      setDet(v.det);
      setQuery(v.query);
      setCamera(v.camera);
      setCursor(v.cursor);
      setHours(v.hours);
      setConfidence(v.confidence);
      setText(v.text);
      setList(v.list);
      setSelected(v.selected);
      setIncLayer(v.incLayer);
      setDetLayer(v.detLayer);
      setEqLayer(v.eqLayer);
      setProximity(v.proximity);
    }
    saved.current = null;
    setLesson(-1);
    pause();
    setMessage("Your previous view is restored.");
  }
  async function exportSnapshot() {
    const detectionSnapshot = det
      ? { ...det, detections: allDet }
      : canada
        ? { ...canada, detections: allDet }
        : null;
    const payload = {
      schema: 1,
      app: "Hazard Atlas",
      version: "0.2.0",
      incidents: inc,
      detections: detectionSnapshot,
      earthquakes: eq,
      view: {
        query,
        cursor: Number.isFinite(cursor) ? cursor : null,
        hours,
        confidence,
        text,
        camera,
        incLayer,
        detLayer,
        eqLayer,
      },
      association:
        proximity && selected?.kind === "incident"
          ? {
              incident: selected.value.id,
              method: "great-circle spatial and temporal proximity only",
              radiusKm: radius,
              start: query.start,
              days: query.days,
            }
          : null,
    };
    const json = JSON.stringify(payload);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json)),
      ),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    download(
      "hazard-atlas-snapshot.json",
      JSON.stringify({ sha256: hash, payload }, null, 2),
      "application/json",
    );
    setMessage(
      "Snapshot saved with original datasets, view, coverage and SHA-256.",
    );
  }
  async function importSnapshot(file?: File) {
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024)
        throw Error("Snapshot exceeds 32 MB limit");
      const { sha256, payload } = JSON.parse(await file.text());
      const actual = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(payload)),
          ),
        ),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (
        actual !== sha256 ||
        payload.schema !== 1 ||
        payload.app !== "Hazard Atlas"
      )
        throw Error("Invalid snapshot schema or hash");
      for (const d of [payload.incidents, payload.detections])
        if (
          d &&
          (!Array.isArray(d.incidents) ||
            !Array.isArray(d.detections) ||
            d.incidents.length + d.detections.length > 50000)
        )
          throw Error("Invalid snapshot records");
      pause();
      setInc(payload.incidents);
      setDet(payload.detections);
      setCanada(null);
      setEq(payload.earthquakes);
      setCursor(payload.view.cursor ?? Infinity);
      setQuery(payload.view.query);
      setFireStart(payload.view.fireStart || fireStart);
      setFireEnd(payload.view.fireEnd || fireEnd);
      setHours(payload.view.hours);
      setConfidence(payload.view.confidence);
      setText(payload.view.text);
      setCamera(payload.view.camera);
      setIncLayer(payload.view.incLayer);
      setDetLayer(payload.view.detLayer);
      setEqLayer(payload.view.eqLayer);
      setSelected(null);
      setProximity(false);
      setMessage("Reopened immutable snapshot without contacting a provider.");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function exportRecords(
    kind: "incidents" | "detections",
    format: "csv" | "geojson",
  ) {
    const features =
      kind === "incidents"
        ? incidents.flatMap((i) =>
            geometryAt(i, cursor).map((g) => ({
              type: "Feature",
              id: i.id + "@" + g.date,
              geometry: { type: g.type, coordinates: g.coordinates },
              properties: {
                recordType: "wildfire-incident",
                ...i,
                geometry: undefined,
                observationDate: g.date,
                precision: g.precision,
              },
            })),
          )
        : detections.map((d) => ({
            type: "Feature",
            id: d.id,
            geometry: { type: "Point", coordinates: [d.longitude, d.latitude] },
            properties: { recordType: "thermal-detection", ...d },
          }));
    const body = { type: "FeatureCollection", features };
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const metadata = {
      schema: 1,
      appVersion: "0.2.0",
      snapshotSHA256: hash,
      sourceSnapshot: kind === "incidents" ? inc : det,
      filters: {
        cursor: Number.isFinite(cursor) ? cursor : null,
        hours,
        confidence,
        text,
      },
      units: {
        brightI4: "K",
        brightI5: "K",
        frp: "MW",
        scan: "km",
        track: "km",
      },
      recordType: kind,
    };
    if (format === "geojson")
      download(
        "hazard-atlas-" + kind + ".geojson",
        JSON.stringify({ ...body, metadata }, null, 2),
        "application/geo+json",
      );
    else {
      const fields =
        kind === "incidents"
          ? [
              "recordType",
              "id",
              "title",
              "status",
              "observationDate",
              "precision",
            ]
          : [
              "recordType",
              "id",
              "acquisition",
              "satellite",
              "instrument",
              "product",
              "version",
              "confidence",
              "brightI4",
              "brightI5",
              "frp",
              "scan",
              "track",
            ];
      download(
        "hazard-atlas-" + kind + ".csv",
        [
          fields.join(","),
          ...features.map((f) =>
            fields
              .map((k) => csvCell((f.properties as any)[k] ?? ""))
              .join(","),
          ),
        ].join("\r\n"),
        "text/csv;charset=utf-8",
      );
      download(
        "hazard-atlas-" + kind + "-metadata.json",
        JSON.stringify({ ...metadata, canonical: body }, null, 2),
        "application/json",
      );
    }
  }
  const status = (d: FireSnapshot | null, name: string) => (
    <div class={"provider-status " + (d?.state || "loading")}>
      <strong>
        {name}: {d?.state || "loading"}
      </strong>
      <small>
        {d?.fetched
          ? "Retrieved " + showTime(d.fetched)
          : "No observations retrieved"}
      </small>
      {d?.error && <p>{d.error}</p>}
      <small>{d?.query}</small>
      {d?.coverage && (
        <small>
          Coverage: {d.coverage.west}, {d.coverage.south} to {d.coverage.east},{" "}
          {d.coverage.north} · {d.coverage.start} + {d.coverage.days} UTC
          day(s). Retrieval completeness does not establish uninterrupted
          satellite coverage.
        </small>
      )}
    </div>
  );
  const toggle = () => {
    if (!auto && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMessage("Reduced motion is enabled. Use manual rotation controls.");
      return;
    }
    setAuto(!auto);
    setWanted(true);
  };
  const counts = (
    <>
      {earthquakes.length > 0 && (
        <span>● {earthquakes.length} earthquakes · </span>
      )}
      <span>
        ▲ {incidents.length} incidents · ■ {detections.length} detections
      </span>
    </>
  );
  const left = (
    <>
      <h2>{p.overview ? "Overview" : "Wildfires"}</h2>
      <p class="muted">Explore natural hazards. Understand their impact.</p>
      <fieldset>
        <legend>Visible layers</legend>
        {p.overview && (
          <label>
            <input
              type="checkbox"
              checked={eqLayer}
              onChange={(e) => setEqLayer(e.currentTarget.checked)}
            />
            ● Earthquakes
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={incLayer}
            onChange={(e) => setIncLayer(e.currentTarget.checked)}
          />
          ▲ Curated incidents
        </label>
        <label>
          <input
            type="checkbox"
            checked={detLayer}
            onChange={(e) => setDetLayer(e.currentTarget.checked)}
          />
          ■ Thermal detections
        </label>
      </fieldset>
      <p class="muted">
        Symbols identify record type, not a shared severity scale. Camera
        movement never changes the dataset scope.
      </p>
      <h3>Source data</h3>
      <div class="fire-date-range">
        <h3>Fire date range</h3>
        <p class="muted">
          UTC, inclusive. Frozen datasets are filtered locally; live providers
          receive this range.
        </p>
        <label>
          Start
          <input
            type="date"
            value={fireStart}
            max={fireEnd}
            onInput={(e) => setFireStart(e.currentTarget.value)}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={fireEnd}
            min={fireStart}
            onInput={(e) => setFireEnd(e.currentTarget.value)}
          />
        </label>
      </div>
      <div class="stack">
        <button
          disabled={!!busy || lesson >= 0}
          onClick={() => load("eonet", false)}
        >
          Refresh EONET
        </button>
        <button
          disabled={!!busy || lesson >= 0}
          onClick={() => load("eonet", true)}
        >
          Frozen incidents
        </button>
        <button
          disabled={!!busy || lesson >= 0}
          onClick={() => load("firms", true)}
        >
          Frozen detections
        </button>
        <button
          disabled={!!busy || lesson >= 0}
          onClick={() => load("cwfis", true)}
        >
          Frozen Canada hotspots
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load("firms", false);
        }}
      >
        <h3>Detection search</h3>
        <p class="muted">Explicit bounds; at most 30° × 30°, 1–5 days.</p>
        <div class="bounds-fields">
          {(["west", "south", "east", "north"] as const).map((k) => (
            <label>
              {k}
              <input
                type="number"
                required
                step="any"
                value={query[k]}
                onInput={(e) =>
                  setQuery({ ...query, [k]: +e.currentTarget.value })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Start UTC
          <input
            type="date"
            required
            value={query.start}
            onInput={(e) =>
              setQuery({ ...query, start: e.currentTarget.value })
            }
          />
        </label>
        <label>
          Days
          <input
            type="number"
            min="1"
            max="5"
            required
            value={query.days}
            onInput={(e) =>
              setQuery({ ...query, days: +e.currentTarget.value })
            }
          />
        </label>
        <button disabled={!!busy || lesson >= 0}>
          Retrieve region detections
        </button>
      </form>
      <label>
        Incident title
        <input
          type="search"
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setPage(0);
          }}
        />
      </label>
      <label>
        VIIRS confidence
        <select
          value={confidence}
          onChange={(e) => {
            setConfidence(e.currentTarget.value);
            setPage(0);
          }}
        >
          <option value="">All qualities</option>
          {["low", "nominal", "high"].map((v) => (
            <option>{v}</option>
          ))}
        </select>
      </label>
      <p class="muted">Confidence is a detector quality category.</p>
      {status(inc, "EONET")}
      {status(det, "FIRMS")}
      {status(canada, "CWFIS Canada")}
      {p.overview && (
        <p class="muted">
          USGS:{" "}
          {eq
            ? `${eq.stale ? "stale" : "available"} · ${eq.query} · ${eq.fetched}`
            : "unavailable"}
        </p>
      )}
    </>
  );
  const center = (
    <div class="fire-globe">
      <div class="earth-heading">
        <h2>{flat ? "Earth · map" : "Earth · globe"}</h2>
        <button
          onClick={() => {
            pause();
            setFlat(!flat);
          }}
        >
          {flat ? "3D globe" : "2D map"}
        </button>
      </div>
      <Globe
        events={earthquakes}
        objects={objects}
        overview
        selected={selected?.value.id || ""}
        onSelect={(e) => choose({ kind: "earthquake", value: e })}
        onObject={onObject}
        camera={camera}
        setCamera={setCamera}
        flat={flat}
        plates={false}
        region={
          det?.coverage ? { ...det.coverage, name: "Detection coverage" } : null
        }
        section={false}
        auto={auto}
        speed={speed}
        pause={pause}
      />
      <div class="globe-controls">
        <button
          aria-label="Rotate left"
          onClick={() => {
            pause();
            setCamera({ ...camera, lon: camera.lon - 20 });
          }}
        >
          ←
        </button>
        <button
          aria-label="Rotate up"
          onClick={() => {
            pause();
            setCamera({ ...camera, lat: Math.min(85, camera.lat + 15) });
          }}
        >
          ↑
        </button>
        <button
          aria-label="Rotate down"
          onClick={() => {
            pause();
            setCamera({ ...camera, lat: Math.max(-85, camera.lat - 15) });
          }}
        >
          ↓
        </button>
        <button
          aria-label="Rotate right"
          onClick={() => {
            pause();
            setCamera({ ...camera, lon: camera.lon + 20 });
          }}
        >
          →
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => {
            pause();
            setCamera({ ...camera, zoom: Math.min(2.5, camera.zoom + 0.2) });
          }}
        >
          ＋
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => {
            pause();
            setCamera({ ...camera, zoom: Math.max(0.65, camera.zoom - 0.2) });
          }}
        >
          −
        </button>
        <button
          onClick={() => {
            pause();
            setCamera({ lon: -115, lat: 38, zoom: 1 });
          }}
        >
          Reset view
        </button>
      </div>
      <div class="globe-controls">
        <button aria-pressed={auto} onClick={toggle}>
          {auto
            ? "Auto-rotate: on"
            : wanted
              ? "Resume rotation"
              : "Auto-rotate: off"}
        </button>
        <label>
          Rotation speed
          <select
            value={speed}
            onChange={(e) => setSpeed(+e.currentTarget.value)}
          >
            <option value="0.5">½×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      <p class="map-credit">
        Natural Earth ·{" "}
        <span class="incident-symbol">▲ Incident locations</span> ·{" "}
        <span class="detection-symbol">■ Thermal detections</span>
        {p.overview ? " · ● Earthquakes" : ""}
        <br />
        Dashed bounds show detection dataset coverage. Points are not
        perimeters.
      </p>
    </div>
  );
  const selectedView =
    selected?.kind === "incident" ? (
      <>
        <p class="eyebrow">Curated incident · NASA EONET</p>
        <h2 ref={details} tabIndex={-1}>
          {selected.value.title}
        </h2>
        <p>
          Provider status: <strong>{selected.value.status}</strong>
          {selected.value.closed
            ? " · closed record " + showTime(selected.value.closed)
            : ""}
        </p>
        <p>
          Open/closed does not establish burning, extinguished, or containment.
        </p>
        {selected.value.description && <p>{selected.value.description}</p>}
        <h3>Dated source geometry</h3>
        {selected.value.geometry.map((g) => (
          <p>
            {showTime(g.date)} ·{" "}
            {g.type === "Point"
              ? "Representative point, not affected area"
              : "Source polygon"}
            <br />
            {g.type === "Point" ? (
              <>
                Latitude {(g.coordinates as number[])[1].toFixed(5)}°, longitude{" "}
                {(g.coordinates as number[])[0].toFixed(5)}°{" "}
                <button
                  onClick={() =>
                    centreOn(
                      (g.coordinates as number[])[0],
                      (g.coordinates as number[])[1],
                    )
                  }
                >
                  Centre globe on location
                </button>
              </>
            ) : (
              "Sourced area rendered on globe"
            )}
          </p>
        ))}
        {selected.value.sources
          .filter((s) => safeSource(s.url))
          .map((s) => (
            <p>
              <a href={safeSource(s.url)} target="_blank" rel="noreferrer">
                Original source: {s.id}
              </a>
            </p>
          ))}
        <p class="muted">
          {inc?.fetched ? "Retrieved " + showTime(inc.fetched) : ""} ·{" "}
          {selected.value.id}
        </p>
        <label>
          Proximity radius km
          <input
            type="number"
            min="1"
            max="500"
            value={radius}
            onInput={(e) =>
              setRadius(Math.max(1, Math.min(500, +e.currentTarget.value)))
            }
          />
        </label>
        <button
          onClick={() => {
            setProximity(!proximity);
            setList("detections");
            setPage(0);
          }}
        >
          {proximity ? "Clear proximity" : "Inspect nearby loaded detections"}
        </button>
        <p class="muted">
          Within {radius} km of the latest supplied point, {query.start} +{" "}
          {query.days} UTC day(s). Spatial/temporal proximity only; no confirmed
          membership. Load a covering region using Detection search.
        </p>
      </>
    ) : selected?.kind === "detection" ? (
      <>
        <p class="eyebrow">Satellite thermal observation</p>
        <h2 ref={details} tabIndex={-1}>
          {selected.value.product === "CWFIS_FIREM3_HOTSPOTS"
            ? "CWFIS satellite hotspot"
            : "NOAA-20 thermal detection"}
        </h2>
        <dl>
          <dt>Acquisition · UTC, minute precision</dt>
          <dd>
            {showTime(selected.value.acquisition).replace(":00 UTC", " UTC")}
          </dd>
          <dt>Location</dt>
          <dd>
            Latitude {selected.value.latitude.toFixed(5)}°, longitude{" "}
            {selected.value.longitude.toFixed(5)}°{" "}
            <button
              onClick={() =>
                centreOn(selected.value.longitude, selected.value.latitude)
              }
            >
              Centre globe on location
            </button>
          </dd>
          <dt>Instrument / product</dt>
          <dd>
            {selected.value.instrument} / {selected.value.product}
          </dd>
          <dt>Source version</dt>
          <dd>{selected.value.version}</dd>
          <dt>Confidence</dt>
          <dd>{selected.value.confidence} (quality category)</dd>
          <dt>Brightness temperature I4 / I5</dt>
          <dd>
            {measure(selected.value.brightI4, "K")} /{" "}
            {measure(selected.value.brightI5, "K")}
          </dd>
          <dt>Fire radiative power</dt>
          <dd>{measure(selected.value.frp, "MW")}</dd>
          <dt>Scan × track</dt>
          <dd>
            {measure(selected.value.scan, "km")} ×{" "}
            {measure(selected.value.track, "km")}
          </dd>
          <dt>Day / night</dt>
          <dd>{selected.value.dayNight === "D" ? "Day" : "Night"}</dd>
        </dl>
        <p>
          A thermal anomaly is not an ignition point, confirmed wildfire or
          burned area. Pixel dimensions do not measure fire size.
        </p>
        <a href={fireSources[2].url} target="_blank" rel="noreferrer">
          Read NASA’s interpretation guidance
        </a>
        <p class="muted">
          Retrieved {det?.fetched ? showTime(det.fetched) : "unknown"}
        </p>
      </>
    ) : selected?.kind === "earthquake" ? (
      <>
        <h2 ref={details} tabIndex={-1}>
          {selected.value.properties.place}
        </h2>
        <p>
          Magnitude {selected.value.properties.mag ?? "unavailable"} · Depth{" "}
          {measure(selected.value.geometry.coordinates[2], "km")}
        </p>
        <p>
          {showTime(new Date(selected.value.properties.time).toISOString())}
        </p>
        <p>Review status: {selected.value.properties.status}</p>
        <a
          href={safeSource(selected.value.properties.url)}
          target="_blank"
          rel="noreferrer"
        >
          Original USGS event
        </a>
        <p>
          <button onClick={p.onEarthquake}>
            Open complete earthquake module
          </button>
        </p>
      </>
    ) : (
      <>
        <h2>Select an observation</h2>
        <p>
          Choose a triangle, square or list entry to inspect its source and
          time.
        </p>
        <h3>Three kinds of record</h3>
        <p>
          Earthquakes are events. EONET records curated incidents and dated
          locations. FIRMS records satellite observations of heat. Their counts
          describe different things.
        </p>
      </>
    );
  const right = (
    <>
      {selectedView}
      {selected && (
        <>
          <p>
            {excluded
              ? "Selected record is excluded by current filters or replay."
              : !currentSelected
                ? "Selected record is absent from the refreshed dataset."
                : ""}
          </p>
          <button onClick={() => setSelected(null)}>Clear selection</button>
        </>
      )}
      <section class="fire-learning">
        <h2>Learn with observations</h2>
        {lesson < 0 ? (
          <>
            {fireLessons.map((l, i) => (
              <button onClick={() => startLesson(i)}>{l.title}</button>
            ))}
            <p>
              Three activities use attributed frozen data. Your view is restored
              afterward.
            </p>
          </>
        ) : (
          <>
            <h3>{fireLessons[lesson].question}</h3>
            <p>
              Step {step + 1} of 3: {fireLessons[lesson].steps[step]}
            </p>
            <div class="stack">
              <button
                onClick={() => {
                  if (step < 2) setStep(step + 1);
                  else
                    setMessage(
                      "Activity complete. " + fireLessons[lesson].explain,
                    );
                }}
              >
                {step < 2 ? "Next step" : "Complete & reflect"}
              </button>
              <button onClick={() => startLesson(lesson)}>
                Reset activity
              </button>
              <button onClick={returnView}>Return to my exploration</button>
            </div>
            <p>{fireLessons[lesson].explain}</p>
            <a
              href={fireSources[fireLessons[lesson].source].url}
              target="_blank"
              rel="noreferrer"
            >
              Read the source
            </a>
          </>
        )}
      </section>
    </>
  );
  const rows =
    list === "incidents"
      ? incidents
      : list === "detections"
        ? detections
        : earthquakes;
  const bottom = (
    <>
      <div class="fire-replay">
        <strong>Replay · UTC</strong>
        <button
          disabled={!times.length}
          onClick={() => {
            pause();
            setCursor(lo);
          }}
        >
          Restart
        </button>
        <button
          disabled={!times.length}
          aria-pressed={playing}
          onClick={() => {
            setAuto(false);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause replay" : "Play observations"}
        </button>
        <input
          aria-label="Observation time"
          type="range"
          min={lo}
          max={hi || 1}
          value={Number.isFinite(cursor) ? cursor : hi}
          disabled={!times.length}
          onInput={(e) => {
            pause();
            setCursor(+e.currentTarget.value);
          }}
        />
        <span>
          {Number.isFinite(cursor)
            ? new Date(cursor).toISOString()
            : "All acquisition times"}
        </span>
        <label>
          Trailing hours
          <select
            value={hours}
            onChange={(e) => setHours(+e.currentTarget.value)}
          >
            {[1, 6, 12, 24, 48].map((n) => (
              <option value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            pause();
            setCursor(Infinity);
          }}
        >
          Show all
        </button>
      </div>
      <details class="timeline-note">
        <summary>Time semantics and dataset scope</summary>Detections: (cursor −
        window, cursor]. Incidents: dated geometry records only; date-only
        locations enter after the day ends. Earthquakes in Overview retain their
        independently labelled dataset. No inferred fire state between records.
      </details>
      <div class="fire-list-tools">
        <div role="group" aria-label="Record list">
          {[
            "incidents",
            "detections",
            ...(p.overview ? ["earthquakes"] : []),
          ].map((v) => (
            <button
              aria-pressed={list === v}
              onClick={() => {
                setList(v);
                setPage(0);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <details class="export-menu">
          <summary>Export & snapshots</summary>
          <div>
            <button onClick={exportSnapshot}>Save complete snapshot</button>
            <label class="file-button">
              Reopen snapshot
              <input
                type="file"
                accept=".json"
                onChange={(e) => importSnapshot(e.currentTarget.files?.[0])}
              />
            </label>
            {list !== "earthquakes" && (
              <>
                <button
                  onClick={() =>
                    exportRecords(list as "incidents" | "detections", "geojson")
                  }
                >
                  Export GeoJSON
                </button>
                <button
                  onClick={() =>
                    exportRecords(list as "incidents" | "detections", "csv")
                  }
                >
                  Export CSV
                </button>
              </>
            )}
            <button
              onClick={() => {
                const u = new URL(location.href);
                u.searchParams.set(
                  "atlas",
                  JSON.stringify({ query, confidence, text }),
                );
                navigator.clipboard
                  .writeText(u.href)
                  .then(() =>
                    setMessage(
                      "View link copied. A query link is not an immutable archive.",
                    ),
                  )
                  .catch(() => setMessage(u.href));
              }}
            >
              Copy view link
            </button>
          </div>
        </details>
      </div>
      <div class="fire-records">
        {rows.slice(page * 50, page * 50 + 50).map((row) => (
          <button
            class="fire-record"
            onClick={() => {
              if (list === "incidents")
                choose({ kind: "incident", value: row as Incident });
              else if (list === "detections")
                choose({ kind: "detection", value: row as Detection });
              else choose({ kind: "earthquake", value: row as Event });
            }}
          >
            <span>
              {list === "incidents"
                ? "▲ " + (row as Incident).title
                : list === "detections"
                  ? "■ NOAA-20 · " + (row as Detection).confidence
                  : "● " + (row as Event).properties.place}
            </span>
            <small>
              {list === "incidents"
                ? (row as Incident).status
                : list === "detections"
                  ? showTime((row as Detection).acquisition)
                  : "M " + (row as Event).properties.mag}
            </small>
          </button>
        ))}
      </div>
      {rows.length === 0 && (
        <p>
          No matching loaded records. Check source state, coverage, layers and
          time before interpreting an empty list.
        </p>
      )}
      <div class="pagination">
        <button
          disabled={page === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
        >
          Previous records
        </button>
        <span>
          {rows.length} {list} · page {page + 1}
        </span>
        <button
          disabled={(page + 1) * 50 >= rows.length}
          onClick={() => setPage(page + 1)}
        >
          Next records
        </button>
      </div>
    </>
  );
  useEffect(() => {
    try {
      const v = JSON.parse(
        new URLSearchParams(location.search).get("atlas") || "null",
      );
      if (v) {
        if (v.query) setQuery({ ...defaultQuery, ...v.query });
        if (typeof v.text === "string") setText(v.text);
        if (["", "low", "nominal", "high"].includes(v.confidence))
          setConfidence(v.confidence);
      }
    } catch {}
  }, []);
  return (
    <>
      {(message || busy) && (
        <div class="atlas-message" role="status">
          {busy ? "Retrieving " + busy + "…" : message}
          {!busy && <button onClick={() => setMessage("")}>Dismiss</button>}
        </div>
      )}
      <Workspace
        left={left}
        center={center}
        right={right}
        bottom={bottom}
        context={counts}
      />
    </>
  );
}
function Atlas() {
  const [route, setRoute] = useState(
    () => location.hash.slice(1) || "overview",
  );
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const go = (r: string) => {
    location.hash = r;
    setRoute(r);
  };
  return (
    <div class="atlas-app">
      <a class="skip" href="#atlas-content">
        Skip navigation
      </a>
      <header class="atlas-header">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            ◎
          </span>
          <h1>Hazard Atlas</h1>
        </div>
        <nav aria-label="Main">
          {[
            ["overview", "Overview"],
            ["earthquakes", "Earthquakes"],
            ["wildfires", "Wildfires"],
            ["learn", "Learn"],
            ["sources", "Sources & References"],
          ].map(([key, title]) => (
            <button
              aria-current={route === key ? "page" : undefined}
              onClick={() => go(key)}
            >
              {title}
            </button>
          ))}
        </nav>
      </header>
      <main id="atlas-content" class="atlas-content">
        <div class="module-view" hidden={route !== "earthquakes"}>
          <EarthquakeApp active={route === "earthquakes"} />
        </div>
        <div
          class="module-view"
          hidden={!["overview", "wildfires", "learn"].includes(route)}
        >
          <FireExplorer
            active={["overview", "wildfires", "learn"].includes(route)}
            overview={route === "overview"}
            learn={route === "learn"}
            onEarthquake={() => go("earthquakes")}
          />
        </div>
        {route === "learn" && (
          <div class="learn-entry">
            <button onClick={() => go("earthquakes")}>
              Earthquake lessons: open Earthquakes, then Learn
            </button>
            <span>
              Wildfire activities are in Details & learning (Learn tab on
              mobile).
            </span>
          </div>
        )}
        {route === "sources" && (
          <article class="sources-page">
            <h2>Sources & References</h2>
            <p>
              Explore natural hazards. Understand their impact. An independent
              educational observatory, not an emergency notification service,
              evacuation planner or prediction engine. No runtime LLM calls,
              accounts or telemetry.
            </p>
            <p>
              Built by Bruce Hoppe.{" "}
              <a href="https://github.com/bruce-hoppe_uoft/hazard-atlas">
                Hazard Atlas source code
              </a>
              . Based on{" "}
              <a href="https://github.com/bruce-hoppe_uoft/earthquake-observatory">
                Earthquake Observatory
              </a>
              . No NASA, USGS or University of Toronto endorsement.
            </p>
            {fireSources.map((s) => (
              <section>
                <h3>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </h3>
                <p>{s.body} Documentation verified 2026-09-06.</p>
              </section>
            ))}
            {sources.map((s) => (
              <section>
                <h3>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </h3>
                <p>
                  {s.author}. {s.purpose} Verified {s.verified}.
                </p>
              </section>
            ))}
            <h3>Frozen observations</h3>
            <p>
              NASA EONET records for 1–5 September 2026; NOAA-20 VIIRS public
              download subset at 125–110°W, 30–49°N, acquired 5 September 2026.
              Retrieved 6 September 2026. Snapshots retain source links and
              retrieval time. Datasets have different coverage. Third-party
              source links are provenance, not separately ingested GDACS
              integration.
            </p>
            <h3>Roadmap</h3>
            <p>
              Storms, floods, volcanoes, drought, forecasts and impact
              estimation are outside version 1.
            </p>
          </article>
        )}
      </main>
      <footer class="atlas-footer">
        <a
          href="https://github.com/bruce-hoppe_uoft/hazard-atlas"
          target="_blank"
          rel="noreferrer"
        >
          Built by Bruce Hoppe · Source on GitHub
        </a>
        <a href={sources[0].url}>USGS</a>
        <a href={fireSources[0].url}>NASA EONET</a>
        <a href={fireSources[1].url}>NASA FIRMS</a>
        <button onClick={() => go("sources")}>Map credits & references</button>
      </footer>
    </div>
  );
}
render(<Atlas />, document.getElementById("app")!);
