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
