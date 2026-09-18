# Sources and verification

Official provider documentation and data endpoints were checked 2026-09-18 UTC.

| Provider or asset | Version 1 role | Boundary |
|---|---|---|
| [USGS GeoJSON feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | Existing recent earthquake observations | Catalog records can be revised; counts are snapshots. |
| [USGS FDSN catalog](https://earthquake.usgs.gov/fdsnws/event/1/) | Existing bounded historical retrieval | Historical replay is reconstructed from the mutable catalog, not historical knowledge. |
| [NASA EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | Curated wildfire incidents and original source links | `closed` is a provider status and may not be the exact physical end; geometry dates can be date-only. |
| [NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) | Bounded satellite detections | Requires a server-side MAP_KEY; Area API permits 1–5 days and has a 5,000 transaction/10-minute limit. |
| [NASA FIRMS science guidance](https://www.earthdata.nasa.gov/data/tools/firms/faq) | Interpretation and limitations | Thermal detections do not establish perimeters, burned area, or incident membership. Confidence is product-specific. |
| [NOAA-20 VIIRS active fire product](https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2) | Initial FIRMS product | `VIIRS_NOAA20_NRT`; near-real-time data is not silently treated as a research archive. |
| [NASA FIRMS US/Canada API](https://firms.modaps.eosdis.nasa.gov/usfs/api/) | Cross-border US/Canada satellite detections | Same MAP_KEY model; separate endpoint and product coverage from the global FIRMS service. |
| [Natural Resources Canada CWFIS](https://cwfis.cfs.nrcan.gc.ca/) | Canada agency-reported fires and Fire M3 hotspots | Reported fires and satellite hotspots are separate products; CWFIS warns that maps are approximations and may not be current. |
| [CWFIS data services catalogue](https://cwfis.cfs.nrcan.gc.ca/downloads/docs/en/references/cwfif/cwfis-data-placemat.pdf) | Canadian WMS/WFS/WCS layers | Includes active fires, reported fires, hotspots, perimeter estimates and National Fire Database products; services are migrating to CWFIF. |
| [CWFIS Active Wildland Fires WFS](https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=public:cwfif_national_activefires&outputFormat=application/json) | Agency-reported active fire incidents | Daily locations and provider fields from participating provincial, territorial and Parks Canada agencies; not complete national reporting and not satellite detection. |
| [Copernicus EFFIS](https://forest-fire.emergency.copernicus.eu/applications/data-and-services) | Europe, Middle East and North Africa | Active fires, burnt areas, fire danger and severity are available through free web services with stated licensing. |
| [Copernicus EMS Early Warning Data Store](https://ewds.climate.copernicus.eu/) | Historical and forecast global/EU forest-fire information | Registration or account access may be required for downloads; it is a data-store source, not silently treated as a live incident feed. |

Frozen demo fixtures were retrieved 2026-09-06 UTC. EONET was queried for wildfire records from 2026-09-01 through 2026-09-05. The FIRMS fixture is a public NOAA-20 24-hour CSV spatial subset for 125–110°W, 30–49°N on 2026-09-05 and contains 97 detections. The CWFIS fixture is the official 2026-09-05 daily Fire M3 hotspot CSV filtered to Canada and contains 309 detections. These are attributed demonstration snapshots, not proof of complete satellite coverage. Fixture provenance is in `internal/wildfire/testdata/provenance.json`.

Copyright © 2026 Bruce Hoppe is retained in source comments and LICENSE rather than displayed in the interface. Provider and geography credits remain visible; the About and Sources panels name the included MIT licence. Hazard Atlas does not imply NASA, USGS, or GDACS endorsement.
