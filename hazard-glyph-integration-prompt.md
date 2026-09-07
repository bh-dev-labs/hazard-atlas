# Task: add glyph-based multi-hazard layers with live updating data

You are working inside an existing hazards web application that already renders
wildfire and earthquake locations on a 2D map and a 3D globe. Do not rewrite it.
Read the existing code first, match its conventions, and integrate.

## Step 0 — inventory before you write anything

Report back on these before making changes:

1. Which map/globe libraries are in use, and their versions (Cesium? Leaflet?
   MapLibre? deck.gl? three.js?).
2. Where hazard data is currently fetched, and on what cadence.
3. How wildfire and earthquake markers are currently created and styled.
4. Whether there is existing state management, and if so what.
5. Build setup: bundler, TypeScript or JavaScript, module format.

Propose a file-level plan and wait for approval before implementing.

## Goal

Expand from 2 hazard types to 13, using NASA EONET as the event source and GDACS
as the severity source. Every hazard is drawn with a distinct outline glyph.
Category is encoded by glyph shape; severity is encoded by color. The two
encodings stay independent — this is the core design rule and must not be
collapsed into "one color per hazard type".

## Data layer

### Source 1 — NASA EONET v3 (primary event feed, no API key)

```
https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=30
```

Thirteen categories, use these exact ids:

`wildfires`, `volcanoes`, `severeStorms`, `floods`, `earthquakes`,
`landslides`, `drought`, `dustHaze`, `seaLakeIce`, `snow`, `tempExtremes`,
`waterColor`, `manmade`

Notes that will bite you if ignored:

- An EONET event carries an **array** of dated geometry entries, not a single
  point. A cyclone is one event with many points forming a track. Preserve the
  full array on the normalized record — do not flatten to the latest point at
  fetch time. The timeline feature below depends on it.
- Geometry may be `Point` or `Polygon`. Handle both.
- EONET's `earthquakes` category is sparse. Keep the existing USGS feed as the
  authoritative earthquake source and suppress EONET earthquakes to avoid
  duplicates.
- Events stay `open` for a long time. `days=30` bounds the payload; make it
  configurable.

### Source 2 — GDACS (severity overlay, no API key)

```
https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH?fromdate=YYYY-MM-DD&todate=YYYY-MM-DD
```

Returns GeoJSON with `alertlevel` of `Green` / `Orange` / `Red`, plus severity
text and impact estimates.

**Deduplication is required.** EONET already ingests GDACS as an upstream
source, so the same event appears in both feeds. Each EONET event has a
`sources` array; entries with `id: "GDACS"` contain a URL with an `eventid`
query parameter. Parse that id and join on it. When a match exists, attach the
GDACS alert level and severity text to the EONET record and render **one**
marker, not two.

Events with no GDACS match get alert level `unknown` — a fourth neutral state.
Do not default them to green; absence of a severity assessment is not an
assessment of low severity.

### Normalized record

Normalize both feeds into a single internal shape before anything touches the
renderers:

```
{
  id, category, title,
  geometry: [{ date, type, coordinates, magnitudeValue, magnitudeUnit }, ...],
  startDate, endDate, closed,
  alertLevel: 'red' | 'orange' | 'green' | 'unknown',
  severityText, sourceUrls
}
```

Both renderers consume only this shape. Neither should know that EONET or GDACS
exist.

### Refresh

- Poll every 15 minutes; make the interval configurable.
- Fetch in the background and diff against current state — never clear and
  repopulate, which causes a visible flash and drops any open popup.
- Apply added / updated / removed as incremental changes to the existing
  marker collections.
- On fetch failure keep the last good data on screen, surface a quiet stale
  indicator with the last successful update time, and retry with exponential
  backoff. Never blank the map on a network error.
- Send a descriptive `User-Agent` header. Cache with `ETag` / `If-None-Match`
  where the endpoint supports it.
- Proxy these calls through the app's own backend if one exists, both to avoid
  CORS surprises and to cache a single upstream response across all clients.

## Glyphs

Use Tabler outline icons (MIT licensed). Suggested mapping, one per category:

| Category | Icon |
|---|---|
| wildfires | `flame` |
| volcanoes | `mountain` |
| severeStorms | `cyclone` |
| floods | `ripple` |
| earthquakes | `activity` |
| landslides | `triangle` |
| drought | `droplet-off` |
| dustHaze | `wind` |
| seaLakeIce | `snowflake` |
| snow | `cloud-snow` |
| tempExtremes | `temperature` |
| waterColor | `droplet` |
| manmade | `building-factory` |

Build a **shared canvas atlas** used by both renderers. Do not use a webfont —
fonts cannot be sampled as textures by the 3D renderer, and maintaining two
separate glyph sets guarantees they drift apart.

Requirements for atlas generation:

- Render each icon's SVG path to a canvas via `Path2D`, stroked, with round
  line caps and joins.
- Draw a **filled circular backing plate** behind the glyph. A bare outline
  stroke is illegible over satellite imagery, snow, and ocean. The plate carries
  the severity fill; the glyph is stroked in the darker shade of the same color
  family.
- Bake at 2–3× `devicePixelRatio`. Upscaled low-resolution billboards look
  visibly soft on retina displays.
- Generate once at startup, cache by `category + alertLevel`, and reuse. Never
  regenerate per marker or per frame.

## Severity color

Four states, applied identically in 2D and 3D:

| Level | Plate | Glyph stroke |
|---|---|---|
| red | `#FCEBEB` | `#A32D2D` |
| orange | `#FAEEDA` | `#854F0B` |
| green | `#EAF3DE` | `#3B6D11` |
| unknown | neutral gray | mid gray |

Provide dark-mode equivalents if the app has a dark theme.

## 3D globe

- One billboard per event, positioned from the geometry entry active at the
  current timeline position.
- Set `disableDepthTestDistance` to infinity so markers do not disappear behind
  terrain.
- Apply distance-based scaling so glyphs stay legible when zoomed out instead of
  becoming unreadable confetti.
- Clamp to ground where the renderer supports it.
- Above a few hundred visible events, switch to a batched collection or
  clustering rather than individual entities.

## 2D map

- Same atlas, same severity colors, smaller pixel dimensions than 3D — the 2D
  view supports hover, so targets can be denser.
- Cluster at low zoom. Cluster badges show the count and take the color of the
  **highest** severity contained, not an average.
- Real data will stack many wildfires in the same region. Implement collision
  handling or spiderfy on click; overlapping identical glyphs are the most
  common failure mode of this kind of map.

## Timeline

Add a scrubber covering the fetched window, defaulting to the present.

- As the scrub position moves, show each event only when the position falls
  within its start and end dates.
- For multi-point events, draw the geometry entries up to the current position
  as a faded trail, with the full-opacity glyph at the active point. Cyclone
  tracks animate for free from data already in the payload.
- Optional but valuable: a duration ribbon beneath the map, one row per event,
  bar length proportional to duration, colored by severity. Instant events
  (earthquakes, landslides) read as slivers; drought and sea ice span the full
  width. The contrast in persistence is the informative part.

## Constraints

- Do not add a paid data aggregator. Both feeds are free and keyless.
- Do not introduce a new map library. Work with what is already there.
- Category filtering, severity filtering, and timeline scrubbing must all run
  client-side against already-fetched data. No refetch on filter change.
- Keep the existing wildfire and earthquake behavior working throughout. If the
  new pipeline supersedes them, migrate deliberately and verify parity before
  removing old code.
- Include the required attribution for NASA EONET and GDACS in the UI.
- This is not a life-safety system. Include a visible note directing users to
  official warning channels for emergency decisions.

## Acceptance criteria

- All 13 categories render on both 2D and 3D with visually distinct glyphs.
- Category and severity are independently legible; toggling a severity filter
  does not change which shapes appear.
- GDACS severity is joined onto EONET events with no duplicate markers.
- Data refreshes on an interval without flashing, and survives a failed fetch
  without clearing the display.
- Scrubbing the timeline animates a multi-point storm track.
- Glyphs remain sharp on a retina display at all zoom levels.
