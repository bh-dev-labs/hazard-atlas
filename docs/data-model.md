# Hazard Atlas data model

Hazard Atlas keeps three records separate:

- An event is an identified earthquake or curated wildfire incident.
- An observation is a dated measurement or source geometry, such as a FIRMS thermal detection.
- A source record is the provider payload, identifier, retrieval time, query, and revision/provenance metadata.

Earthquakes retain the inherited USGS GeoJSON schema. Wildfire incidents use a namespaced `eonet:<id>` source identifier, title, description, provider open/closed status, source links, and an ordered list of dated Point or Polygon geometries. FIRMS records use a product-specific `firms:<sha256>` identity derived from product, satellite, acquisition minute, coordinates, and version. Repeated retrievals of the same observation deduplicate without combining separate overpasses.

Temporal precision is explicit. EONET date-only geometry is stored as a day, not an invented midnight event. FIRMS acquisition time is UTC minute precision. Provider status, detector confidence, and earthquake review status are distinct fields. Unknown values remain null or unavailable; zero FRP is retained as numeric zero.

SQLite stores immutable wildfire snapshots, normalized incident/detection membership, and retrieval identities. Current cache entries are bounded to 40 snapshots; user exports are the durable reproducibility boundary. Snapshots include provider, query, retrieval time, completeness/state, coverage, source links, and a hash. A failed provider is reported as failed, a configured cached result may be stale, an unconfigured FIRMS service is unconfigured, and an empty result is only empty after a successful bounded query.

The overview count never combines hazard types into a disaster total. It reports earthquake events, wildfire incidents, and thermal detections independently.
