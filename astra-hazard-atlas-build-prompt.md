# Astra implementation prompt — Hazard Atlas

**Repository:** `hazard-atlas`  
**Product:** Hazard Atlas  
**Tagline:** Explore natural hazards. Understand their impact.  
**Deliverable:** A professionally finished, publishable application built from the existing earthquake program.

## How to use

Open `/Users/bh/Developer/git_projects/hazard-atlas` in your coding environment, select Astra, and attach this file. Say:

> Read this specification. Inspect the existing project, establish a working earthquake baseline, and implement Hazard Atlas through the release gates. Preserve the original earthquake project and its established attribution method.

This specification describes work to perform; it does not claim that the repositories have been inspected, the copy completed, or any implementation tested.

---

## 1. Assignment and existing work

You are the lead software engineer, scientific visualization designer, and release reviewer for Hazard Atlas. Implement a working application in the available local development environment. I want a coherent, professional product that I can publish, demonstrate, and maintain.

My finished earthquake application is here:

`/Users/bh/Developer/git_projects/earthquake-observatory`

My intended new project directory is here:

`/Users/bh/Developer/git_projects/hazard-atlas`

The new directory exists, but do not assume cloning or remote setup is complete. Inspect it first. The earthquake application is the source of working functionality and design decisions. Treat its repository as read-only throughout this task.

My language preferences are Go, Rust, and Python. **The actual working stack takes precedence over choosing new technologies.** Inspect and reuse it. Do not rewrite a functioning application merely to match an earlier hypothetical architecture. Do not add a language or service without a concrete benefit.

Make reasonable, reversible decisions and explain the consequential ones. Proceed beyond planning to implementation, running tests, inspecting the actual UI, and preparing a local release candidate. Ask only for missing information that materially blocks progress. Continue unaffected work when an external service or credential is unavailable.

## 2. Establish the baseline before changing architecture

Read applicable repository instructions, README, dependency manifests and locks, configuration examples, migrations, tests, attribution pages, and deployment workflows. Inspect Git status, branches, recent history, and remotes without exposing credentials.

If `hazard-atlas` already contains the application, work with it and preserve unrelated local changes. If it is empty, clone the committed earthquake repository into it using an independent local clone, preserving history and avoiding shared working files. Do not overwrite a nonempty directory or discard uncommitted source work. Report source changes that are not present in the copied commit. Do not invent a GitHub owner or remote URL. Ensure a local source remote cannot accidentally receive implementation pushes.

Do not copy production databases, secrets, deployment identifiers, or account configuration blindly. Give Hazard Atlas separate local state, cache paths, application identity, development ports where needed, and deployment configuration. Inspect service-worker cache names and browser-storage keys if present. Never migrate or modify the original project's database. If importing its data is useful, use a verified independent snapshot.

If hosting metadata binds the copied application to the earthquake deployment, use that hosting system's supported new-project process; do not reuse or hand-edit opaque resource identifiers. Prepare local release work without deploying or changing the original site.

Run the copied earthquake application using its documented workflow. Capture the baseline commit, actual working features, representative screenshots, build/test results, and existing defects in `docs/baseline.md`. Do not run source-project scripts that could mutate source state.

Record which earlier proposed features are actually implemented. Never claim that a previous prompt proves the feature exists. Preserve working behaviour and clearly distinguish inherited defects from new regressions.

## 3. Product scope and definition of version 1

Hazard Atlas combines an educational Earth observatory with a scientific event explorer. Its first release contains:

1. **Overview:** an integrated globe with independently selectable earthquake and wildfire layers.
2. **Earthquakes:** the existing earthquake experience, preserved as a complete module.
3. **Wildfires:** curated incident exploration plus a distinct satellite thermal-detection overlay.
4. **Learn:** existing earthquake education and new evidence-based wildfire activities.
5. **Sources & References:** clear, navigable provenance and attribution.

Navigation should contain functioning destinations only. Storms, floods, volcanoes, drought, GDACS integration, population exposure, forecasts, and impact estimation belong in the roadmap for later modules. Do not add placeholder navigation or attempt a comprehensive disaster platform in this release.

The product helps users investigate observations and understand natural processes. It is not an emergency notification service, evacuation planner, or disaster prediction engine. State that purpose briefly in About. Avoid repetitive warnings that obstruct normal exploration.

The application must run without LLM calls. Scientific explanations and lessons are reviewed local content, not generated interpretations at runtime.

## 4. Evolve the application incrementally

Extract only capabilities that both implemented modules genuinely need:

- Globe rendering and camera controls.
- Point/polygon layer management, picking, and selected-object state.
- Date controls, replay transport, and documented time semantics.
- Shared event-list shell and information-panel layout.
- Provider status, references, exports, and saved-view infrastructure.
- Accessible navigation and educational content presentation.

Keep earthquake interpretation, magnitude/depth filtering, seismic analysis, and earthquake lessons inside the earthquake module. Keep wildfire interpretation, source statuses, detection measurements, and lessons inside the wildfire module.

Prefer a modular monolith using the existing backend, storage, and frontend. If a backend is genuinely missing and one is needed for shared caching and credentials, prefer a small Go service. Retain the current database unless a demonstrated limitation requires a migration. SQLite is a reasonable new local store; do not introduce PostgreSQL/PostGIS, queues, or microservices pre-emptively.

### Language selection

Preferred architecture when compatible with the working application:

- **Go:** backend API, provider ingestion, shared cache, persistence, exports, and operational endpoints. Favour a single deployable backend.
- **TypeScript:** browser UI, globe integration, selection, layer management, and interactive state. Retain the current frontend framework and globe library where suitable.
- **Python:** optional independent scientific validation, dataset preparation, or analysis tools. Do not make Python a production dependency unless a concrete required capability benefits from it.
- **Rust:** optional only for a demonstrated computational bottleneck or an existing working Rust component. Do not add Rust/WebAssembly simply to use another preferred language.

This is a preference, not a rewrite mandate. If the finished earthquake application already has a sound Python or Rust backend, preserve it unless inspection establishes a worthwhile reason to migrate. Record the actual stack and decision before implementation. Choose maintained compatible dependencies using their official documentation and lock their versions.

Use a small typed module registry or explicit composition. Each module should define its filter controls, renderable layers, detail view, time behaviour, exports, and educational entries. No dynamically installed plugin framework is required. Avoid a giant conditional component or a universal untyped measurements object.

A possible logical structure is `providers/`, `modules/earthquakes/`, `modules/wildfires/`, `shared/`, and `content/`. Adapt this to the repository's conventions; do not mechanically rearrange every file.

## 5. Authoritative sources and provider boundaries

Read current official documentation before implementing each provider. Record the verification date, API version, attribution, permitted usage, limits, and relevant assumptions in `docs/sources.md`.

| Provider | Version 1 role | Official starting point |
|---|---|---|
| USGS | Preserve existing earthquake ingestion and event details | https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php |
| USGS catalog | Preserve existing historical retrieval where implemented | https://earthquake.usgs.gov/fdsnws/event/1/ |
| NASA EONET | Curated wildfire event records and original source links | https://eonet.gsfc.nasa.gov/docs/v3 |
| NASA FIRMS | Satellite active-fire/thermal-anomaly observations | https://firms.modaps.eosdis.nasa.gov/api/area/ |
| NASA FIRMS science guidance | Sensor interpretation and observation limitations | https://www.earthdata.nasa.gov/data/tools/firms/faq |

Source baseline checked 2026-09-06: EONET v3 exposes event categories, dated geometry, source links, and open/closed records. Its closed date is not necessarily an exact physical end time, and some geometry dates lack precise times. Preserve that uncertainty. See [EONET documentation](https://eonet.gsfc.nasa.gov/docs/v3).

The FIRMS area interface uses a MAP_KEY and documents its source, bounding-box, and time-range parameters. Verify its current quotas and acquisition workflow; keep the key on the server and redact request paths that contain it. See [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/).

Start the new modules with EONET wildfire incidents, then add FIRMS. Choose one documented VIIRS product initially and explain the sensor/product choice. Add other products only when their differences are handled and tested. Near-real-time products must not silently substitute for a research-quality archive.

If a key or live access is missing, finish the adapter, configuration, fixture tests, and honest demo mode. Show an accurate administrator configuration state and list the missing live verification as a release blocker for the promised live feature. Never fabricate successful provider calls.

## 6. Event, observation, and source model

Design the data model around three different things:

- **Event:** an identified earthquake or curated wildfire incident.
- **Observation:** a dated measurement, location, geometry, or satellite detection.
- **Source record:** what a provider actually supplied, with its identifiers, retrieval time, and revision/provenance metadata.

Share identity, hazard type, title, location/geometry, source references, and time metadata. Preserve typed hazard-specific details. Keep source namespaced IDs, for example a provider plus its original ID, separate from internal canonical IDs. Do not join unrelated records on title alone.

Represent temporal precision explicitly. Distinguish occurrence/acquisition time, provider publication/revision time when available, and application retrieval time. Do not manufacture an upstream revision timestamp from a fetch timestamp. Distinguish unknown values from numeric zero.

Persist source payloads or reproducible bounded snapshots, normalized records, dataset membership/completeness, and migrations. Keep saved dataset identities separate from the mutable current-event cache. Deduplicate repeated retrievals transactionally without losing provenance. Handle renamed, revised, missing, or explicitly removed records according to their provider semantics.

For FIRMS observations without durable individual IDs, document and test a product-specific deduplication key using available source fields. Do not merge separate overpasses or satellites merely because their coordinates are close. Retain corrections and product versions where identifiable.

Count earthquake events, wildfire incidents, and thermal detections separately. A mixed overview may display counts by type, but must not sum them into a misleading total of disasters.

Keep source-native statuses. A seismic review status, an EONET closed record, a detector confidence field, and a confirmed fire containment status are different concepts.

## 7. Reliable retrieval and bounded workloads

Give providers separate refresh schedules, caches, timeout policies, health states, and request budgets. Follow their current usage policies, including provider-specific stop/retry instructions. Do not apply one generic retry loop to every service.

Implement shared backend retrieval and request coalescing. Visitors should not each trigger identical upstream downloads. Manual refresh must respect the provider schedule. Use cancellation, bounded response sizes, and atomic dataset updates. Report partial retrieval, stale cached results, empty results, and actual failures distinctly.

Use explicit geographic/date bounds for FIRMS queries. Support date-line crossing through tested query splitting. Do not fetch worldwide detailed detections merely because a user opened the overview. Load incident-level data globally where practical, then load detections for a requested region with clear coverage labels.

Detect provider caps and avoid silent truncation. Test dense regions, partition boundaries, repeated observations, missing headers, malformed CSV/JSON, and date conversions. Track covered query regions and intervals so cached points do not falsely imply a complete search.

Separate missing observations from confirmed absence. A failed provider or incomplete acquisition is not “zero hazards.” Show freshness by source, not just one optimistic global timestamp. Bound cache growth and document retention and cleanup.

## 8. Globe, selection, and dashboard requirements

Preserve the existing globe's visual quality and successful interactions. Rebrand product-facing text to Hazard Atlas while retaining accurate historical credits, source names, and module-specific labels. Do not globally replace every occurrence of the old project name.

The globe must support drag rotation, zoom, reset, direct object selection, and keyboard alternatives. Retain or complete auto-rotation with a visible toggle and slow adjustable speed. Pause it on interaction and selection, offer explicit resume, respect reduced motion, and suspend unnecessary rendering when hidden. Camera rotation and replay are independent states.

For the overview, use distinguishable hazard symbols and a clear layer legend. Never compare earthquake magnitude and fire detections through one marker-size severity scale. Within a dedicated module, retain its scientifically meaningful colour mapping with the appropriate legend.

Represent point locations as points and sourced areas as polygons. If an incident location is only a representative point, label it accordingly. Do not draw invented affected-area circles. Handle globe occlusion, near-limb selection, poles, date-line geometries, overlapping markers, and clustering accurately. Dense detection clusters must show detection counts, not incident counts.

Selecting an object opens the existing side panel or mobile sheet:

- Earthquake: preserve its established scientific fields and original source link.
- Wildfire incident: title, provider status, dated locations, description if available, source links, data freshness, and nearby observations action.
- Thermal detection: observation time, satellite/instrument/product, available confidence/quality fields with product-specific meaning, and appropriate measurements with units.

Selection remains stable across refreshes and coordinated views. Explain if an object becomes excluded by filters. Picking during replay pauses playback for inspection. Distinguish clicks from drags and touch pinches. Provide accessible event-list selection when graphics are unavailable.

### Full desktop workspace — required

Use the entire available desktop browser content area. Build an application workspace that fills the viewport width and height; do not wrap it in a narrow centred landing-page container or impose a fixed maximum page width. Fullscreen browser mode is optional, not required to obtain this layout. On large monitors the globe must grow with the space, rather than leaving wide unused margins.

Use a compact top navigation bar; a collapsible left layer/filter panel; a flexible central globe; a collapsible, resizable right details/learning panel; and a resizable bottom timeline/event-list region. Suggested initial desktop sizes are approximately 240px left and 340px right, with the globe consuming the remainder; adapt these based on measured content and available width. Offer Globe focus and Reset layout actions. Retain settings locally and clamp persisted sizes when the window or display changes.

Panel resizing must resize the actual renderer and update its aspect ratio, pixel density, picking coordinates, and chart layout. Use sensible minimum dimensions, keyboard-operable splitters, and tested pointer handling so resizing never starts globe rotation. Keep the primary workspace within the available height, with internal scrolling for long lists and details. Keep compact footer references accessible without covering the timeline or globe controls. A focused globe view must retain essential time, selection, and source context.

Use screen area for usable views rather than filler metrics, oversized text, or stretched cards. On smaller desktop/tablet widths collapse secondary panels into accessible drawers before squeezing the globe. On mobile use deliberate Globe/List/Learn navigation with usable sheets and controls, dynamic viewport sizing, and safe-area handling. Verify browser zoom and enlarged text as well as physical screen sizes.

Inspect the running application at 1440×900, 1920×1080, and 2560×1440, plus 1024px and 390px widths. Check that no fixed-width wrapper limits expansion, resize handles work, panels remain reachable, and markers stay selectable after resizing. Do not claim ultrawide verification without running it. Show the user's selected dataset scope explicitly; camera movement alone must not silently change counts.

## 9. Wildfire scientific interpretation

Implement the wildfire module as an evidence viewer. A FIRMS detection is not automatically a separate wildfire, an ignition point, a fire perimeter, or a damage estimate. Sensor pixels, geolocation, acquisition conditions, and thermal sources limit interpretation. Provide sourced explanations based on [NASA FIRMS guidance](https://www.earthdata.nasa.gov/data/tools/firms/faq).

Do not infer burned area by counting detections or summing nominal pixel areas. Do not interpolate a spreading perimeter from point detections. Treat any later authoritative perimeter as its own dated, sourced layer.

For “nearby detections,” show the selected radius/region and time interval. Label matches as spatial/temporal proximity unless an authoritative source supplies a relationship. A documented association table should record the matching method and evidence; do not let proximity create a definitive incident membership or causal statement.

Do not translate EONET open/closed into burning/extinguished or a containment percentage. Preserve source coverage limitations. Distinguish hazard observations from reported human impact and modeled estimates. Version 1 must not invent casualty figures, affected populations, risk probabilities, forecasts, or universal severity scores.

## 10. Timeline and educational experience

Retain the earthquake replay and make each module define what its timeline displays:

- Earthquakes appear at occurrence time under the existing documented mode.
- Thermal detections appear by acquisition time within an explicit trailing window.
- Incident geometry uses available dated records; unknown intervals are not silently filled with imagined states.

Use UTC internally and an explicit display time zone. Test date-only data, daylight saving, boundary inclusivity, and future observations during backward seek. Label date-only records without fake midnight precision.

Freeze a dataset for reproducible replay. Explain that replay reconstructed from current records is not necessarily what observers knew at that historical moment. Reproducing historical knowledge requires archived source versions and publication times.

Preserve existing earthquake lessons. Add three complete wildfire lessons using attributed frozen observations:

1. **Incident versus detection:** toggle incident records and detection layers; observe why their counts differ.
2. **How satellites observe heat:** inspect acquisition times and sensor fields; learn what detections can and cannot establish.
3. **Read a sequence of observations:** scrub a documented interval; compare observation patterns without inventing a spread boundary.

Each lesson needs a question, two to four working interactions, a brief explanation, source references, reset, and return to the previous user view. Keep content in reviewable structured files. Use notice → change → compare → explain. Avoid mandatory quizzes, accounts, or runtime chatbots.

Require observed data to support the lesson's conclusion. Do not claim expert validation unless a qualified review actually occurred. Satellite before/after imagery is optional after version 1 unless the repository already supports it; record attribution and acquisition dates if included.

## 11. Attribution and source references — corrected requirement

An earlier request to display a personal email address as a “coded by” footer was withdrawn. **Do not restore that public email credit, add a mailto link, or invent replacement attribution.** Inspect the finished earthquake application's footer, About page, documentation, and relevant recent commits for the established replacement method, and preserve it.

If those sources do not identify the agreed method, record the unresolved attribution wording and ask one focused question when necessary. Continue implementation and retain existing legitimate author/license notices. Do not substitute guessed institutional branding or imply endorsement by NASA or USGS.

Retain and extend footer references with links for USGS data, NASA EONET, NASA FIRMS, scientific explanations, map/globe credits, and a complete Sources & References page. Identify the actual providers and assets used, their licenses, dataset versions where available, and verification dates. Keep required on-map attribution visible. Link sources near scientific explanations as well as in the footer.

Use a shared source registry where practical to keep UI references and documentation aligned. Preserve source-code license obligations and attribution inherited from the original repository.

## 12. Security, deployment separation, and operations

Retain working security practices and adapt them to the new providers. Store credentials server-side, redact keys from URLs and logs, validate user queries, parameterize SQL, and treat external descriptions as untrusted text. Do not build an arbitrary upstream URL proxy. Allowlist outbound sources and handle redirects deliberately.

Configure conservative rate and resource limits for public endpoints. Preserve origin protections, appropriate security headers, and accessible error messages. Keep costly imports and administrative configuration unavailable to anonymous visitors.

Separate Hazard Atlas deployment targets, database volumes, secret names, analytics identity, caches, and domains from the earthquake application. Document these changes and check copied CI workflows before any push that could trigger deployment. A copied deployment identifier is not permission to overwrite the original application.

Provide useful logs, process health, and separate provider-health/freshness reporting. Verify graceful shutdown, restart recovery, database backup/restore, and migrations against a copied fixture database. Do not claim multi-instance support without implementing scheduler/storage coordination.

Prepare a local release candidate. Public publishing, paid resources, new external accounts, and changes to the original application's deployment are outside this implementation request unless separately authorized. Finish all reviewable local work first.

## 13. Quality and release evidence

Publishable means functional, scientifically honest, visually coherent, accessible, and reproducible. It does not mean merely that the server starts.

| Gate | Required evidence |
|---|---|
| Original-project isolation | No task-induced source changes; distinct data and deployment targets |
| Earthquake regression | Baseline selection, globe controls, filters, replay, details, education, and exports remain correct where implemented |
| Data adapters | Attributed fixtures, schema/null/error tests, units, date precision, revision handling, bounded live smoke checks |
| Wildfire identity | Repeated fetches do not duplicate records; detections remain separate from incidents |
| Coverage | Partial, failed, stale, unconfigured, and genuinely empty states remain distinct |
| Geography | Known coordinates, point/polygon rendering, date-line cases, far-side occlusion, tested proximity calculations |
| Interaction | Click/tap selection, overlapping choices, auto-rotation pause/resume, replay seek, coherent selected-state panels |
| Learning | Three wildfire lessons complete with reproducible data, working controls, and accurate explanations |
| Accessibility | Automated checks plus manual keyboard/focus and reduced-motion checks; non-graphics access to records |
| Responsive UI | Full desktop width/height at 1440×900, 1920×1080, and 2560×1440; resizable/collapsible panels; correct renderer resizing; usable 1024px/390px layouts and enlarged text |
| Export | Complete selected dataset, stable snapshot, filters/units/source metadata, safe CSV text escaping |
| Operations | Fresh install, build, migrate, restart, backup/restore, independent configuration |
| Attribution | Existing agreed method preserved, withdrawn email credit absent, real sources linked |

Run meaningful automated tests using deterministic fixtures rather than depending on live services in CI. Verify critical scientific calculations with independently known cases, not only a second invocation of the same function.

Measure performance against the original baseline and a documented mixed stress fixture, initially 10,000 earthquake points plus 20,000 detections. State hardware, browser, data size, p95 filter latency, and globe frame rate. Aim for cached filtering below 250ms and normal globe interaction at least 30 fps on the reference machine; resolve measured bottlenecks through indexing, batching, clustering, workers, or view-bounded retrieval. Document actual limits and avoid invented results.

Conduct two review passes: scientific/data correctness, then visual/interaction quality. Inspect actual rendered screens and core mobile workflows. Fix material findings and keep a short review log. If browser tooling or a provider is unavailable, label that verification as incomplete and explain its release impact.

## 14. Exports and reproducibility

Preserve existing earthquake export contracts where possible. Add separate exports for wildfire incidents and thermal observations, with explicit record types, units, observation times, source IDs, and provenance. Do not flatten all hazards into ambiguous magnitude/severity columns.

Offer UTF-8 CSV and GeoJSON where appropriate, with accompanying metadata describing query bounds, active filters, coverage/completeness, retrieval time, schema/app version, and snapshot hash. CSV sanitization must not destroy canonical source values; retain an unambiguous machine-readable representation.

Saved URLs reproduce a view/query; they are not immutable archives. Saved snapshots must support the stated replay/export without contacting a changing upstream catalog. Clearly mark demonstration data and its retrieval date. Never fabricate live timestamps.

## 15. Working sequence and deliverables

Implement these milestones in order, continuing through completion:

1. **Inspect and establish baseline:** verify the copy, actual stack, source isolation, attribution method, and working earthquake experience.
2. **Introduce Hazard Atlas shell:** product identity, routes, separate runtime state, and shared boundaries with earthquake regression checks.
3. **Add EONET incident exploration:** ingestion, persistence, globe/list selection, source-linked details, and complete failure states.
4. **Add FIRMS observation layer:** bounded retrieval, server-side configuration, detection selection, proximity inspection, and scientific labeling.
5. **Complete education and reproducibility:** three lessons, timeline semantics, exports, snapshots, and references.
6. **Review and harden:** scientific tests, browser inspection, accessibility, performance, security, and operational checks.
7. **Prepare release candidate:** reproducible build, documentation, screenshots, limitations, and an evidence-based release decision.

Deliver complete source changes with dependency locks and migrations, updated quick-start instructions, configuration examples without secrets, tests, and the following documents or equivalent existing locations:

- `docs/baseline.md`
- `docs/migration-plan.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/scientific-methods.md`
- `docs/sources.md`
- `docs/operations.md`
- `docs/release-readiness.md`
- `docs/implementation-status.md`

Update the README with the new product scope, actual setup commands, supported modes, provider setup, and screenshots. Include a five-minute demonstration: rotate Earth, select an earthquake, switch to wildfires, inspect a detection, replay observations, complete a lesson, and export a snapshot.

Keep changes reviewable and retain the original history. Do not overwrite user work, rewrite shared history, or make broad dependency upgrades unrelated to the task. Report exact failed commands and blockers. Distinguish configured CI from CI that actually passed.

The final handoff must state what works, how to run it, what was tested, what remains blocked, and whether publication is justified by the evidence. Do not silently drop required features or call unfinished work production-ready.

**Begin with inspection of `/Users/bh/Developer/git_projects/hazard-atlas`, establish the earthquake baseline, and then implement the migration.**
