# 0.4.2 — local release

The footer carries the copyright notice “© 2026 Bruce Hoppe”, and the application no longer links to its own repository anywhere: not from the footer, the About panel, the Sources panel, the README or the quick start. Both panels now point to the MIT licence that ships with the application instead. Credits to other projects, such as the tectonic plate dataset and the Tabler icon set, are unchanged, because those attributions are owed to their authors.

# 0.4.1 — local release

The footer credit reads “Built by Bruce Hoppe” as plain text and no longer links to the repository. The source code, licence and issue tracker are still reachable from the About and Sources panels.

# 0.4.0 — local release

Adds a Hazards tab covering every NASA EONET category except wildfires and earthquakes, which keep the pipelines they already had — EONET's own earthquakes category is dropped so USGS remains the source of record. Each category has its own outline glyph and each event a severity colour drawn from GDACS, and the two encodings stay independent: filtering by severity never changes which shapes appear. A legend in the panel documents all thirteen glyphs and the four severity states.

GDACS severity is attached to an EONET event through the event id EONET already publishes in its own GDACS source link, so a shared event draws one marker rather than two. Events GDACS has not assessed read as "no assessment" rather than green, since no assessment is not the same as a low one. In practice EONET frequently cites other upstreams for its open events, so expect that state to be common.

Category, severity and timeline filtering happen entirely in the browser against data already retrieved. Scrubbing the timeline animates multi-point events such as cyclone tracks, and markers that would land on top of one another group into a count badge that separates on click.

Also corrects two defects introduced in 0.3.4: a pane that had been hidden could show a zero-width globe until its resize observer caught up, and the bundled browser regression check had been failing against the second marker canvas.

# 0.3.5 — local release

Wildfire incident and detection markers no longer shimmer or bounce while the globe rotates, and no longer flicker between clustered and individual as they cross a detection-cluster boundary. A stability refactor earlier in the 0.3.x series had accidentally dropped their device-pixel snapping; it's restored here at the same quarter-device-pixel grid used for country labels.

# 0.3.4 — local release

Country names now render as vector glyph outlines instead of translated canvas sprites, in their own SVG layer, snapped to a quarter device pixel each frame. This removes the flicker that a live vector redraw introduced during rotation, without the visible pixel-step "bounce" a coarser snap causes. The white halo stroke around each label is gone — it was itself a source of shimmer, and the flat ocean background is contrasty enough without it.

# 0.3.3 — local release

Fixes the remaining country-label and fire-marker jumping under rotation. Country names retain fixed geographic anchors, and labels and point markers reuse cached images while moving at exact projected coordinates. The canvas no longer resets its backing storage on every frame. Markers render above country labels and remain selectable.

# 0.3.2 — local release

Incident and detection markers no longer shimmer while the globe rotates. Country names are no longer suppressed by the markers on top of them: a label still never covers another label, but takes the least-covered anchor when no clear one exists, so the United States and Canada keep their names over a busy fire season.

# 0.3.1 — local release

Two corrections to 0.3.0. Country names no longer shimmer while the globe rotates: label text snaps to whole device pixels and holds still until it has earned a full pixel of movement. The footer regains the **Stop the local server** control that the quick start describes; the endpoint had survived the fork but nothing rendered the button.

# 0.3.0 — local release

Adds the observatory analysis features carried over from the earthquake-observatory fork, and fixes a snapshot-identity defect.

Historical results with tied timestamps previously came out of an unordered map in a different order on every run, so an unchanged query produced a different content-addressed dataset ID. Ties now break on event ID, and identical queries yield identical snapshots.

Shared views, reopened snapshots and API responses are validated before they reach application state or the renderer, and a snapshot carrying a `sha256` is verified against its own observations. Historical retrieval reports upstream requests, completed partitions and running event counts, and cancelling now cancels the work on the server rather than only abandoning the browser request; a cancelled run is never stored as a complete dataset.

Event details gain a source uncertainty and quality panel, depth sections take a custom great-circle transect with an editable corridor, country names are an optional map layer, and detail responses expire after five minutes or when USGS revises the event.

Packages target macOS Apple silicon, macOS Intel and Windows 11 x64. No runtime Go or Node installation is needed. Public publication is not claimed: see docs/release-readiness.md for executed evidence and unresolved gates, including operating-system validation and code signing.

# 0.1.0 — local release candidate

New Go application with embedded Preact/TypeScript frontend and SQLite persistence. Includes rotatable geographic globe and flat map, direct event selection, current activity cells, filters, event details, historical queries, replay, charts, four guided activities, linked Tonga section, magnitude illustration, exports, snapshot import and references.

Packages target macOS Apple silicon, macOS Intel and Windows 11 x64. No runtime Go/Node installation is needed. Public publication is not claimed: see docs/release-readiness.md for executed evidence and unresolved gates, including operating-system validation and code signing.
