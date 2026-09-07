import { useEffect, useMemo, useState } from "preact/hooks";
import { Globe, type Camera } from "./Globe";
import { Workspace } from "./Workspace";
import { defaultSection } from "./data";
import { type Event } from "./model";
import {
  HAZARD_CATEGORIES,
  activeAt,
  markersAt,
  type AlertLevel,
  type HazardCategory,
  type HazardMarker,
  type HazardRecord,
  type HazardSnapshot,
} from "./hazards";
import { HAZARD_LEGEND } from "./hazardIcons";
const emptyEvents: Event[] = [];
const SEVERITIES: AlertLevel[] = ["red", "orange", "green", "unknown"];
const CATEGORY_TITLE: Record<HazardCategory, string> = {
  volcanoes: "Volcanoes",
  severeStorms: "Severe storms",
  floods: "Floods",
  landslides: "Landslides",
  drought: "Drought",
  dustHaze: "Dust and haze",
  seaLakeIce: "Sea and lake ice",
  snow: "Snow",
  tempExtremes: "Temperature extremes",
  waterColor: "Water color",
  manmade: "Manmade",
};
const Glyph = (p: { d: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d={p.d}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
const SEVERITY_TITLE: Record<AlertLevel, string> = {
  red: "Red",
  orange: "Orange",
  green: "Green",
  unknown: "No assessment",
};
export function HazardExplorer(p: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<HazardSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [camera, setCamera] = useState<Camera>({ lon: 10, lat: 15, zoom: 1 });
  const [flat, setFlat] = useState(false);
  const [auto, setAuto] = useState(false);
  const [categories, setCategories] = useState<Set<HazardCategory>>(
    () => new Set(HAZARD_CATEGORIES),
  );
  const [severities, setSeverities] = useState<Set<AlertLevel>>(
    () => new Set(SEVERITIES),
  );
  const [cursor, setCursor] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Globe.tsx calls this on every pointer-down specifically to freeze
  // rotation before the user aims a click; it must stop auto-rotate too,
  // not just timeline playback, or clicking a glyph while rotating never
  // gets a stable target to land on.
  const pause = () => {
    setAuto(false);
    setPlaying(false);
  };
  useEffect(() => {
    let active = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) =>
        fetch(cfg.demo ? "/api/hazards?demo=true" : "/api/hazards?days=30"),
      )
      .then((r) => r.json())
      .then((d) => {
        if (active) setSnapshot(d);
      })
      .catch((e) => active && setMessage(String(e)));
    return () => {
      active = false;
    };
  }, []);
  const records = snapshot?.records || [];
  const bounds = useMemo(() => {
    const starts = records.map((r) => Date.parse(r.startDate));
    const ends = records.map((r) =>
      Date.parse((r.closed ? r.endDate : r.endDate) + "T23:59:59.999Z"),
    );
    const lo = starts.length ? Math.min(...starts) : 0,
      hi = ends.length ? Math.max(...ends) : 0;
    return { lo, hi };
  }, [records]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setCursor((c) => {
        const next =
          (Number.isFinite(c) ? c : bounds.lo) + (bounds.hi - bounds.lo) / 200;
        if (next >= bounds.hi) {
          setPlaying(false);
          return bounds.hi;
        }
        return next;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [playing, bounds.lo, bounds.hi]);
  const filtered = useMemo(
    () =>
      records.filter(
        (r) => categories.has(r.category) && severities.has(r.alertLevel),
      ),
    [records, categories, severities],
  );
  const active = useMemo(
    () => filtered.filter((r) => activeAt(r, cursor)),
    [filtered, cursor],
  );
  const markers = useMemo(() => markersAt(active, cursor), [active, cursor]);
  const selected: HazardRecord | null =
    records.find((r) => r.id === selectedId) || null;
  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };
  const left = (
    <>
      <h2>Hazards</h2>
      <p class="muted">
        Every EONET hazard category except wildfires (its own tab) and
        earthquakes (USGS stays the source of record for those). Category is
        shape, severity is color — filtering one never changes which shapes
        appear.
      </p>
      <section class="hazard-legend">
        <h3>Glyph legend</h3>
        <div class="legend-grid">
          {HAZARD_LEGEND.map((item) => (
            <span class="legend-item" key={item.id}>
              <Glyph d={item.d} />
              {item.title}
            </span>
          ))}
        </div>
        <div class="legend-severity">
          {(
            [
              ["red", "Red"],
              ["orange", "Orange"],
              ["green", "Green"],
              ["unknown", "No assessment"],
            ] as const
          ).map(([level, title]) => (
            <span class="legend-item" key={level}>
              <i
                class="legend-swatch"
                style={{
                  background: `var(--severity-${level}-plate)`,
                  borderColor: `var(--severity-${level}-stroke)`,
                }}
              />
              {title}
            </span>
          ))}
        </div>
      </section>
      {message && (
        <div class="atlas-message" role="status">
          {message}
          <button onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}
      {snapshot?.state === "stale" && (
        <p class="muted" role="status">
          Showing the last successful update ({snapshot.fetched}); the most
          recent retrieval failed.
        </p>
      )}
      <fieldset>
        <legend>Category</legend>
        {HAZARD_CATEGORIES.map((c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={categories.has(c)}
              onChange={() => toggle(categories, c, setCategories)}
            />
            {CATEGORY_TITLE[c]}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Severity (GDACS)</legend>
        {SEVERITIES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={severities.has(s)}
              onChange={() => toggle(severities, s, setSeverities)}
            />
            {SEVERITY_TITLE[s]}
          </label>
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={flat}
          onChange={(e) => setFlat(e.currentTarget.checked)}
        />
        Flat map
      </label>
      <p class="muted" role="note">
        This is not a life-safety system. For evacuation or emergency decisions,
        use your local official warning channels.
      </p>
      <p class="muted">
        Source:{" "}
        {(snapshot?.sources || []).map((s, i) => (
          <span key={s.url}>
            {i > 0 && ", "}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.id}
            </a>
          </span>
        ))}
      </p>
    </>
  );
  const center = (
    <div class="fire-globe">
      <Globe
        events={emptyEvents}
        hazards={markers}
        onHazard={(m: HazardMarker) => setSelectedId(m.id)}
        selected=""
        onSelect={() => {}}
        camera={camera}
        setCamera={setCamera}
        flat={flat}
        plates={false}
        countries
        transect={defaultSection}
        region={null}
        section={false}
        auto={auto}
        speed={1}
        pause={pause}
      />
      <div class="globe-controls">
        <button aria-pressed={auto} onClick={() => setAuto(!auto)}>
          {auto ? "Auto-rotate: on" : "Auto-rotate: off"}
        </button>
      </div>
    </div>
  );
  const bottom = (
    <div class="fire-timeline">
      <label>
        Timeline
        <input
          type="range"
          min={bounds.lo}
          max={bounds.hi || bounds.lo + 1}
          value={Number.isFinite(cursor) ? cursor : bounds.hi}
          onInput={(e) => {
            pause();
            setCursor(Number(e.currentTarget.value));
          }}
        />
      </label>
      <button
        onClick={() => {
          if (!playing && (!Number.isFinite(cursor) || cursor >= bounds.hi))
            setCursor(bounds.lo);
          setPlaying(!playing);
        }}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <span class="muted">
        {active.length} of {filtered.length} hazards active ·{" "}
        {Number.isFinite(cursor)
          ? new Date(cursor).toISOString().slice(0, 10)
          : "present"}
      </span>
    </div>
  );
  const right = selected ? (
    <>
      <h2>{selected.title}</h2>
      <p class="muted">{CATEGORY_TITLE[selected.category]}</p>
      <p>
        Severity: <strong>{SEVERITY_TITLE[selected.alertLevel]}</strong>
        {selected.severityText && " · " + selected.severityText}
      </p>
      <p class="muted">
        {selected.startDate}
        {selected.endDate !== selected.startDate
          ? " – " + selected.endDate
          : ""}
        {selected.closed ? "" : " (ongoing)"}
      </p>
      {selected.sourceUrls.length > 0 && (
        <p>
          {selected.sourceUrls.map((u, i) => (
            <span key={u}>
              {i > 0 && " · "}
              <a href={u} target="_blank" rel="noreferrer">
                Source {i + 1}
              </a>
            </span>
          ))}
        </p>
      )}
      <button onClick={() => setSelectedId(null)}>Clear selection</button>
    </>
  ) : (
    <p class="muted">
      Click a glyph on the globe for details. A cluster badge separates into its
      members on click; click it again to regroup.
    </p>
  );
  return (
    <Workspace
      left={left}
      center={center}
      right={right}
      bottom={bottom}
      context={<></>}
    />
  );
}
