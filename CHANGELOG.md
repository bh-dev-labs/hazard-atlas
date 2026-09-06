# Changelog

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
