# Implementation status

2026-09-06 UTC. Hazard Atlas 0.2.0 local release candidate. Original build prompt preserved; the earthquake source repository was inspected read-only and remains isolated.

Implemented: Go executable and embedded Preact/TypeScript production interface; SQLite schema 1 and transactional revision protection; raw dataset snapshots/membership; bounded recent and partitioned historical USGS retrieval; retry/conditional request/stale recovery; same-origin API; spherical globe/2D map; rotation, zoom, picking, overlap chooser, reduced-motion control; explicit geographic bounds and current activity cells; details/product links; nearby loaded-observation filtering; cumulative replay; UTC/time-zone display; coordinated charts; CSV/GeoJSON/SVG export; snapshot import; share links; historical demo; four guided activities; linked Tonga depth section; magnitude comparison; source registry/glossary/footer credits; operations/docs/CI/release pipeline.

Resolved during verification:

- Cached unchanged payloads initially retained the old fetch time; updated on successful revalidation.
- TypeScript Canvas handler had a missing brace; fixed before the first successful build.
- Missing test-runtime Node types; installed pinned @types/node and rebuilt.
- Automated accessibility detected a count-label contrast ratio below 4.5; darkened it.
- Dialog Escape could race the effect listener; handled directly in the dialog.
- Section vertical-exaggeration text was inconsistent with the plot; now derived from actual scales.
- Camera rotation rebuilt charts unnecessarily; memoized coordinated analyses and filters.
- Browser harness needed an explicit context for axe and needed to scroll the globe into view before a direct mouse click; corrected test harness.

Sandbox-only failures: outbound downloads initially failed DNS; rerun with approved network access. TypeScript test runner and localhost listener were denied local sockets; rerun with approved process access. Exact test commands and final evidence are in release-readiness.md.

Do not equate the local release candidate with full completion of every publication gate in the supplied specification. Remaining limitations are tracked explicitly in release-readiness.md. No public deployment, notarization, Windows runtime verification or external expert review is claimed.

Hazard Atlas additions: full-viewport resizable Overview/Wildfires workspace; independent earthquake, EONET and CWFIS reported-fire incidents, FIRMS NOAA-20 VIIRS and Natural Resources Canada CWFIS Fire M3 layers; server-side provider adapters with SQLite snapshots, bounded queries, date-line splitting and distinct stale/failed/unconfigured/partial/empty states; incident/detection details and proximity labelling; three wildfire activities; hashed complete snapshots; typed CSV/GeoJSON exports; sources and references; separate `HazardAtlas/hazard-atlas.db` state and port 8789. Frozen fixtures include 21 EONET wildfire incidents, 97 bounded FIRMS detections, and 309 Canada CWFIS hotspot detections retrieved 2026-09-06 UTC. Live CWFIS reported-fire retrieval is now verified against the CWFIF WFS and deduplicates time-versioned records by national fire ID. Live FIRMS keyed retrieval remains configuration-dependent; CWFIS agency coverage and reporting limits remain visible in the source state.
