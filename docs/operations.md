# Hazard Atlas operations

The executable listens on loopback `127.0.0.1:8789` by default and stores independent state in the `HazardAtlas` user configuration directory as `hazard-atlas.db`. Use `-data-dir` for a test or clean-room state. The earthquake source project and its database are never opened by Hazard Atlas.

Use `-demo` for embedded earthquake data and the frontend's frozen EONET/FIRMS buttons for wildfire fixtures. Set `HAZARD_ATLAS_FIRMS_MAP_KEY` only in the server environment. The key is never sent to the browser, logged, or included in a snapshot. EONET and FIRMS have separate cache lanes, refresh budgets, timeouts, and provider state.

`GET /api/health` and `/api/ready` expose process and SQLite readiness. `-check-db` runs an integrity check. `-backup path` uses SQLite `VACUUM INTO` for a consistent backup. Restore by copying the backup to a clean `hazard-atlas.db` path and running `-check-db` before starting the server. Shutdown remains graceful on Ctrl+C.

FIRMS requests require explicit bounds and 1–5 UTC days. Date-line bounds are split at ±180°. Response bodies are capped, redirects are denied, and provider caps are surfaced as partial/incomplete states. A failed refresh preserves a prior cached result with a stale state; it is never presented as confirmed absence. Cache retention is bounded by snapshot count; disk-byte quotas and multi-instance scheduler coordination are not implemented.

The local candidate has no public deployment, analytics identity, cloud credential, or service-worker cache. CI does not deploy.
