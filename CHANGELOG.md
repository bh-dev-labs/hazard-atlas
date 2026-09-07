# Changelog

## 0.4.0 (2026-09-07 UTC)

- New **Hazards** tab covering every NASA EONET category except wildfires and earthquakes, which keep their existing pipelines: EONET's own earthquakes category is discarded server-side so USGS stays the sole source of record.
- Category is encoded by glyph shape and severity by colour, and the two are independent — filtering one never changes which shapes appear. A glyph legend documents all thirteen categories and the four severity states.
- GDACS severity is joined onto EONET events by the event id each record already carries in its own GDACS source URL, so a matched event renders as one marker rather than two. An unmatched event stays "no assessment" and is never defaulted to green; absence of an assessment is not an assessment of low severity.
- EONET and GDACS are fetched concurrently with a 15-second cap on the severity overlay alone. GDACS routinely takes 7–25 seconds and sometimes exceeds the client timeout, so a slow overlay now degrades to a partial result with an explanation instead of delaying the events. Cold retrieval dropped from over 25 seconds to about 4.
- Category, severity and timeline filtering all run against the already-fetched snapshot, with no refetch. Multi-point events (a cyclone track) animate along the scrubber, drawing the passed points as a faded trail.
- Overlapping markers bucket to a grid instead of stacking invisibly; a bucket of more than one draws as a count badge in its worst contained severity, and clicking separates it into a ring.
- Fixed a country-label regression from 0.3.4: the canvas began taking an inline width that overrides the stylesheet, so a pane that had been hidden stayed collapsed to zero width until the resize observer caught up.
- Fixed `scripts/hazard-browser-check.mjs`, which had been failing since 0.3.4 because the added marker canvas made its `canvas` selector ambiguous.

## 0.3.5 (2026-09-06 UTC)

- Restored device-pixel snapping for wildfire incident and detection markers, which a prior stability refactor had accidentally dropped: their straight-edged triangle/square icons were drifting subpixel and shimmering under rotation, and jittering across the detection-cluster grid in a way that looked like inconsistent rotation.
- Markers snap to a quarter device pixel, matching the country-label fix: fine enough that the step between snap points is imperceptible, but coarse enough to damp the re-rasterization flicker.

## 0.3.4 (2026-09-06 UTC)

- Country labels are drawn as vector glyph outlines (traced from the bundled font) instead of translated canvas sprites, positioned in a dedicated SVG layer between the geography and hazard-marker canvases.
- Label position is snapped to a quarter device pixel each frame, damping the flicker from re-rasterizing anti-aliased glyph edges at an arbitrary subpixel phase without introducing a visible positional step.
- Removed the white halo/outline stroke around country names; a crisp stroke was itself a source of shimmer under rotation, and the flat ocean background gives the labels enough contrast without it.

## 0.3.3 (2026-09-06 UTC)

- Country labels keep fixed geographic anchors instead of jumping between collision offsets.
- Labels and incident/detection markers reuse rasterized images at exact projected coordinates for smooth movement. Canvas backing storage is resized only when dimensions change.
- Added a 240-frame browser regression check across globe/map views and standard/Retina pixel densities, including marker picking and glyph-cache reuse.

## 0.3.2 (2026-09-06 UTC)

- Incident and detection markers no longer shimmer under rotation; they snap to device pixels like the labels.
- Country names are no longer vetoed by markers. A label still never covers another label, but a marker cluster on its anchor is a cost rather than a refusal: the label takes a clear anchor when one exists and the least-covered otherwise, so the country carrying the most observations keeps its name. Long formal names use their atlas forms ("United States", "DR Congo").

## 0.3.1 (2026-09-06 UTC)

- Country names no longer shimmer under rotation: label text snaps to whole device pixels, so a label holds still until it has earned a full pixel of movement instead of re-rasterizing every frame.
- Restored the **Stop the local server** control in the footer. The `/api/quit` endpoint and its styling survived the fork, but no button rendered it, and the quick start pointed at a control that did not exist.

## 0.3.0 (2026-09-06 UTC)

- Optional country names on the globe and flat map, in both the earthquake view and the hazard atlas; labels drop the far side of the globe, skip event and detection markers, and travel in the shared view link.
- Fixed unstable snapshot identity: history results with tied timestamps came out of an unordered map in a different order each run, so an unchanged query produced a different content-addressed dataset ID.
- Shared views, reopened snapshots and API responses are validated before they reach state or the renderer; a snapshot carrying a `sha256` is verified against its own observations, and malformed input preserves the loaded dataset instead of drawing from it.
- Historical retrieval reports upstream requests, completed partitions and running event counts, and Cancel retrieval now cancels the job on the server rather than only abandoning the browser request. A cancelled run is never stored as a complete dataset.
- Historical intervals are normalized to UTC, reject submillisecond boundaries, and require at least one millisecond.
- Event details show source-reported uncertainty and quality: horizontal, depth and magnitude error, azimuthal gap, travel-time residual RMS, nearest-station distance and stations used, distinguishing unavailable from zero.
- Depth sections take a custom great-circle transect with an editable corridor width, drawn on the globe and carried in shared views and export metadata; the section chart scales to the observed depths and pages its event list.
- Event detail responses are cached for five minutes and invalidated when USGS revises the event, instead of being kept forever.
- Table pagination clamps when results shrink, so a narrowed replay or filter no longer shows an empty page.
- `npm run test:browser` builds the real binary, runs it on an ephemeral port against a temporary database, and drives these paths end to end.
## 0.2.0 (2026-09-06 UTC)

- Multi-hazard atlas: NASA EONET curated incidents and FIRMS thermal detections beside USGS earthquakes, with proximity association and immutable snapshots.
- Attribution links to the repository instead of publishing an email address, and states that the project is independent of the University of Toronto and the USGS.
- The release string is single-sourced from `package.json` and reaches Go through `-ldflags`; an unflagged build reports `dev`.
- Colour moved to CSS custom properties with a dark theme, and depth now uses one sequential light-to-dark ramp instead of three unrelated hues.
- Event table sorts from its column headers with `aria-sort`, across five columns in both directions.
- The globe accepts the keyboard: arrows rotate, +/- zoom, N steps through visible markers, Enter opens one, and each landing is announced.
- Charts bin time by the loaded span (hourly, six-hourly or daily), trim empty magnitude bins, and draw real axes scaled to the data.
- Interface split into memoised components so rotation no longer re-renders the table and charts sixty times a second.
- Fixed the region preset whose displayed option cleared the region it named.
- Fixed list reconciliation: keyed rows no longer mispair selection state when sorting or paging.
- Stopping the server moved out of the reference links; felt-report fields collapse to one sentence when nothing was reported.
- Saving a 20,000-event dataset is about 38% faster through prepared statements; the response cache evicts its oldest entry rather than an arbitrary one.

## 0.1.0 (2026-09-06 UTC)

- Initial local Earthquake Observatory application and offline USGS snapshot.
- Selectable current activity areas coordinated with globe and event filters.
- Reproducible source build and macOS/Windows release archives.
