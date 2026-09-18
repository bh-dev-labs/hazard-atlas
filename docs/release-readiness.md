# Release readiness — Hazard Atlas 0.4.0 local candidate

This is a functioning local release candidate. **It is not a claim that every publication gate in the much larger build specification is complete.** The earthquake baseline is preserved, and EONET, FIRMS, Natural Resources Canada CWFIS and GDACS adapters are implemented.

## 0.4.0 verification (2026-09-07 UTC)

- Production frontend build, TypeScript strict check, all 32 frontend tests, `go test ./...`, `go test -race ./internal/hazards/...` and `go vet ./...` passed.
- The animation regression check passed 480 camera frames across globe/map views at DPR 1, 2 and 3. Seven application browser checks, nine Hazard Atlas browser checks and fifteen new Hazards-tab checks passed, the last covering glyph selection, cluster separation and regrouping, independent category/severity filtering, timeline scrubbing and a 1366×768 laptop viewport.
- axe reports zero violations across Earthquakes, Wildfires, **Hazards** and Sources.
- All three ZIPs passed integrity checks. Apple silicon's freshly extracted package reports version 0.4.0 and passed the ten consumer checks in [consumer-test-results.json](consumer-test-results.json), including backup/restore and restart.
- Live provider behaviour was measured rather than assumed: GDACS responded in 6.9 s and 13.7 s and once exceeded the 25 s client timeout, so it is now fetched concurrently with EONET under a 15 s cap of its own and degrades to a partial result. Cold retrieval measured about 4 s.
- **Severity coverage is a data limitation, not a defect.** In the sampled live window none of the 17 open EONET events in the covered categories cited GDACS as a source, so the specified join by GDACS event id matched nothing and every event read as unassessed. GDACS separately listed 16 Orange/Red events over the same window. No geographic or temporal fuzzy matching is performed, because attributing a severity that the assessing body did not assign to that record would misrepresent it.
- Windows x64 and Intel macOS packages were cross-compiled and inspected; runtime execution on those platforms remains unverified. macOS app signatures are local ad-hoc signatures.

## 0.3.3 verification (2026-09-06 UTC)

- Production frontend build and all 26 frontend tests passed; Go tests and vet passed.
- The animation regression check passed 240 camera frames across globe/map views at DPR 1 and 2, verifying fixed geographic anchors, marker picking, glyph-cache reuse and unchanged canvas backing dimensions. Seven full application browser checks also passed.
- All three ZIPs passed integrity and documentation-layout checks. Apple silicon's freshly extracted package reports version 0.3.3 and passed the consumer checks in [consumer-test-results.json](consumer-test-results.json), including backup/restore and restart.
- Windows x64 and Intel macOS packages were cross-compiled and inspected; runtime execution on those platforms remains unverified. macOS app signatures are local ad-hoc signatures.

## Hazard Atlas evidence

| Gate | Result and evidence |
|---|---|
| Baseline isolation | Original `/Users/bh/Developer/git_projects/earthquake-observatory` was clean at `600faf9`; Hazard Atlas uses port 8789, `HazardAtlas/hazard-atlas.db`, separate browser keys, and no source-project writes. See [baseline](baseline.md). |
| Wildfire identity | `internal/wildfire` tests validate EONET IDs, product-specific FIRMS identities, repeated-row deduplication, null versus zero, malformed rows, provider status, polygon/date precision, and date-line bounds. |
| Provider boundaries | EONET v3, FIRMS Area API and CWFIS downloads documentation checked 2026-09-06; GDACS event-list search checked 2026-09-07. FIRMS key is server-only, explicit regions are capped at 30° × 30° and 1–5 days, date-line queries split, CWFIS requests are one selected UTC day, bodies are bounded, redirects denied, and provider caps surface as partial states. Both hazard providers are proxied server-side, which the `connect-src 'self'` policy requires; the GDACS overlay carries its own 15 s deadline so it cannot delay the event feed. |
| Provider records | EONET curated incidents, live CWFIS agency-reported active fires, 97 NOAA-20 VIIRS detections and 309 Canada CWFIS Fire M3 hotspots remain separate products. CWFIS active-fire WFS records are deduplicated by national fire ID and retain the latest status version. |
| Workspace | Browser render at 1440×900 shows full-width panels, separate hazard symbols/counts, keyboard/pointer panel resizing, canvas pixel resizing, timeline/list, source-state panel, and no document overflow. 1920×1080, 2560×1440, 1024px and 390px screenshots are saved under `docs/screenshots/`. |
| Wildfire lessons | Three local activities use frozen records, each with three interactions, explanation, source link, reset, and return-to-view. No incident membership, spread boundary, burned area, casualty, containment, or severity score is inferred. |
| Reproducibility | Complete snapshot export includes both provider datasets, view/query state, coverage, and SHA-256; import validates the hash/schema and does not call providers. Separate incident/detection exports include record type, units, source IDs and metadata. |
| Accessibility | Focusable layer controls, splitters, list alternatives, reduced-motion handling, and source links are implemented. The Hazard Atlas browser suite reports zero axe violations across Earthquakes, Wildfires, Hazards and Sources. |

The original earthquake browser harness remains valid for the module at its new route. Hazard Atlas browser evidence is deliberately separate because the overview adds provider state, panels, lessons and mixed-hazard exports.

## Executed evidence

Host: macOS arm64, Go 1.27.1, Node 26.8.1, headless Chromium 153.0.8010.12. Verification date 2026-09-06 UTC / September 5 America/Toronto.

| Gate | Result and evidence |
|---|---|
| Production frontend | `npm ci`, `npm run build`, TypeScript strict check and Vite production bundle passed; embedded in Go. |
| Formatting/static checks | `npm run format:check`, `gofmt`, `go vet ./...` passed. |
| Data parsing | Go tests cover malformed payloads, coordinate range/order, nulls, negative depth/magnitude, unknown optional raw fields. |
| Persistence | Tests cover newer/older revisions, immutable source snapshots, failed publication, absent rolling-feed members, backup/restore and integrity. |
| Historical retrieval | Tests cover partition cap, boundary deduplication, cancellation, range budget and mid-partition failure with no partial publication. Live historical query also passed through the UI. |
| Reliability | Tests cover 429 retry, conditional 304 response reuse, stale cache and cache freshness. Browser-injected detail and recent outages preserve usable data and recover to offline demo. |
| Time/filter geography | Eight frontend tests cover date-line regions, known landmarks in each hemisphere, far-side occlusion, null/negative filters, backward seek, equal timestamps, UTC/DST conversion, corridor and comparison formulas, CSV escaping and area membership. |
| Globe selection | Browser tests click a centred globe marker, resolve overlap if present, reject drag-as-click, switch map/globe and restore shared selection. Rotation pauses on camera input; explicit resume verified. |
| Replay | Shared cumulative filtering and backward seek tested; restart/show-all and pause interactions exercised in browser. No physical wave simulation is claimed. |
| Lessons | All four navigation/reset/return flows exercised, with a real fixed 618-record USGS dataset. Depth-section entry and completion exercised. Scientific explanations reviewed against sources in this session; not externally expert-validated. |
| Exports | Browser export contains 618 records, independent of table pagination. Canonical snapshot import drives 20,000-event stress check. CSV escaping and magnitude comparison have deterministic unit checks. |
| Accessibility | axe Chromium scan: zero violations after count-label correction. Keyboard rotation buttons, selection alternatives, dialog Escape and focus placement exercised. This is not a full WCAG conformance audit. |
| Responsive visual review | Screenshots at 1440, 1024 and 390 px; no document-level horizontal overflow. Desktop/phone images reviewed. Mobile details sheet has separate screenshot evidence. |
| Live provider | Actual recent query returned 183 observations, complete and not stale, fetched 2026-09-06T00:51:30Z. Count is a snapshot, not a lasting current count. Live historical query passed separately. |
| Performance | 20,000 synthetic events: filtering p95 ≈0.85 ms in Node (100 measured iterations). Chromium rotation 38.0 fps, longest frame 33 ms; browser filter interactions 145–228 ms (mean 170) including Playwright overhead. Heap after ten view switches 225 MB (unforced GC, not a leak determination). Measured on an otherwise idle machine after the component split; a run competing with a release build reported 33 fps and a 193 ms mean, so treat these as indicative rather than absolute. Raw measurements in `extended-test-results.json`. |
| Dependency vulnerabilities | `npm audit` reports zero; `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` reports no vulnerabilities. Scan results are time-specific. |
| Packaging | Hazard Atlas 0.4.0 macOS arm64, macOS amd64 and Windows amd64 cross-builds succeeded. Extracted macOS arm64 archive passed startup, embedded assets, demo, running backup, restart, clean-directory restore and integrity checks through `scripts/consumer-check.mjs`; see `consumer-test-results.json`. Native macOS Launch Services launch, live-mode configuration and ad-hoc signature verification remain local checks. Windows and Intel execution remain unverified. |
| Upstream data quality | 125 of the 618 bundled place descriptions carry a question mark where a non-Latin-1 letter belongs (`Nurda??`, `Pazarc?k`). Verified as upstream: a fresh USGS query returns records identical to the bundled snapshot, differing only in the response's own `generated` timestamp. Descriptions are reproduced as supplied rather than corrected, because editing them would alter an observational record; see `sources.md`. Coordinates, magnitudes, depths and times are unaffected. |
| Attribution/license | Copyright © 2026 Bruce Hoppe is retained in source comments and LICENSE, with no author notice, repository link or address displayed in the interface. About and Sources name the included MIT licence. README, QUICKSTART, MIT LICENSE and third-party notices are included in archives. |
| CI | Workflow configured for Linux/macOS/Windows; no hosted CI run is claimed. |

## Remaining publication gates and deliberate operating limits

- **Native platform acceptance:** run the extracted app on Intel macOS and Windows 11, including browser auto-open, first-run security prompts, restart, export and restore. Cross-compilation and PE/Mach-O inspection do not substitute for these runs. Mobile Safari, VoiceOver/NVDA, actual touch/pinch devices and reduced-capability hardware have not been exercised.
- **Public-download signing:** macOS bundles are locally ad-hoc signed, not Developer ID signed/notarized. Windows executable is not Authenticode signed. These are local redistributable archives, not frictionless signed public installers.
- **Catalog reconciliation:** returned alternate IDs can remap selected records; explicit returned `deleted` status is excluded and identified. There is no periodic deleted/merged catalog audit, durable alias/tombstone schema, or historical overlap revalidation scheduler. Missing rolling-feed membership is correctly not treated as deletion.
- **Resource controls:** current cache is bounded by 40 datasets and each upstream body by 32 MiB, but no configurable disk-byte quota, low-disk recovery workflow or user-pinned database snapshot manager is implemented. Durable reproducibility uses user-owned export files. Historical progress is indeterminate retrieval status with cancellation, not per-partition progress reporting.
- **Scientific/detail precision:** historical partitions are collected from a mutable catalog without snapshot isolation. The source-provided uncertainty fields are preserved in raw recent payloads but not fully surfaced. The Tonga corridor's drawn guide is approximate, while membership uses the tested spherical formula. PB2002 boundary lines are coarse, uniformly styled and do not identify causative faults.
- **Full release-test breadth:** focused tests cover the listed outcomes, not all permutations in the specification. Long-duration memory-leak soak, automated failed-Canvas fallback, every dense/polar hit-picking case, source-link availability for every event product, all keyboard-only lesson interactions and an external scientific content review remain open. The event table remains a non-canvas alternative.
- **Sharing limits:** links point to a local running server and reapply a query; they are not externally hosted. Imported arbitrary snapshots should be shared as files. CSV plus companion metadata uses two downloads, which some browsers require permission to allow.

## Re-run

```sh
npm ci
npm run build
npm test
npm run format:check
go test -race ./...
go vet ./...
# Start demo binary at 127.0.0.1:8789, then:
node scripts/browser-check.mjs
node scripts/hazard-browser-check.mjs
node scripts/extended-check.mjs
node --experimental-strip-types scripts/filter-benchmark.mjs
./scripts/release.sh
node scripts/consumer-check.mjs
```

Browser tests use synthetic fixtures only inside the test harness. Extended tests include an opt-in real historical API request; deterministic unit tests do not need USGS availability.
