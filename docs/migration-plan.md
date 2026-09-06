# Migration and workspace design

Retain the working modular monolith and earthquake module. Add typed wildfire adapters/store and a shared workspace/globe renderer; keep hazard measurements distinct. No dependency upgrades or new runtime language.

The globe remains the visual anchor: pale ocean #e3eef0, geographic land #91adb0, ink #243740, paper #ffffff, interaction green #28685d. Fire incident triangles use #ac3c20; thermal squares use #973f92. System humanist sans text preserves the inherited hierarchy. Compact navigation and left-aligned controls surround a flexible globe; left filters 240px, right details 340px, bottom observations 220px initially. Internal scrolling, keyboard splitters, focus mode and persisted/clamped sizes replace the fixed-width page. This is a scientific workspace, with no decorative metric cards.

Sequence: establish baseline; introduce shell/independent identity; EONET snapshots; bounded NOAA-20 VIIRS detections; frozen lessons/exports; scientific and browser reviews; local release. Preserve the full earthquake experience as a mounted module when switching routes. Runtime defaults become port 8789, HazardAtlas config directory, hazard-atlas.db, and hazard-atlas-prefixed browser keys. Keep original author/license notices and link Hazard Atlas's actual source repository. No publishing or original deployment changes.
