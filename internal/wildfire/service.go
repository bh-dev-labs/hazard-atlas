package wildfire

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

//go:embed testdata/*
var fixtures embed.FS

type Snapshot struct {
	ID         string      `json:"id"`
	Schema     int         `json:"schema"`
	Provider   string      `json:"provider"`
	Product    string      `json:"product"`
	Query      string      `json:"query"`
	Fetched    string      `json:"fetched"`
	State      string      `json:"state"`
	Complete   bool        `json:"complete"`
	Demo       bool        `json:"demo"`
	Error      string      `json:"error,omitempty"`
	Coverage   *Query      `json:"coverage,omitempty"`
	Incidents  []Incident  `json:"incidents"`
	Detections []Detection `json:"detections"`
	Sources    []Source    `json:"sources"`
}
type lane struct {
	mu   sync.Mutex
	next time.Time
	last Snapshot
}
type Service struct {
	db                        *sql.DB
	key                       string
	client                    *http.Client
	eonet, firms, cwfisActive lane
}

func New(db *sql.DB, key string) (*Service, error) {
	_, e := db.Exec(`CREATE TABLE IF NOT EXISTS wildfire_snapshots(id TEXT PRIMARY KEY,provider TEXT NOT NULL,query TEXT NOT NULL,fetched TEXT NOT NULL,payload BLOB NOT NULL,raw BLOB NOT NULL);
 CREATE INDEX IF NOT EXISTS wildfire_query ON wildfire_snapshots(provider,query,fetched);
 CREATE TABLE IF NOT EXISTS wildfire_retrievals(snapshot TEXT NOT NULL,retrieved TEXT NOT NULL,PRIMARY KEY(snapshot,retrieved));
 CREATE TABLE IF NOT EXISTS wildfire_members(snapshot TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(snapshot,id));
 INSERT OR IGNORE INTO schema_version VALUES(2);`)
	return &Service{db: db, key: strings.TrimSpace(key), client: &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return fmt.Errorf("redirect denied") }}}, e
}
func (s *Service) save(d Snapshot, raw []byte) (Snapshot, error) {
	d.ID = hash(append([]byte(d.Provider+"\n"+d.Query+"\n"), raw...))
	d.Schema = 1
	payload, e := json.Marshal(d)
	if e != nil {
		return d, e
	}
	tx, e := s.db.Begin()
	if e != nil {
		return d, e
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`INSERT OR IGNORE INTO wildfire_snapshots VALUES(?,?,?,?,?,?)`, d.ID, d.Provider, d.Query, d.Fetched, payload, raw); e != nil {
		return d, e
	}
	if _, e = tx.Exec(`INSERT OR IGNORE INTO wildfire_retrievals VALUES(?,?)`, d.ID, d.Fetched); e != nil {
		return d, e
	}
	stmt, e := tx.Prepare(`INSERT OR IGNORE INTO wildfire_members VALUES(?,?,?,?)`)
	if e != nil {
		return d, e
	}
	defer stmt.Close()
	for _, v := range d.Incidents {
		b, _ := json.Marshal(v)
		if _, e = stmt.Exec(d.ID, v.ID, "incident", b); e != nil {
			return d, e
		}
	}
	for _, v := range d.Detections {
		b, _ := json.Marshal(v)
		if _, e = stmt.Exec(d.ID, v.ID, "detection", b); e != nil {
			return d, e
		}
	}
	_, e = tx.Exec(`DELETE FROM wildfire_snapshots WHERE id NOT IN (SELECT snapshot FROM wildfire_retrievals GROUP BY snapshot ORDER BY MAX(retrieved) DESC LIMIT 40); DELETE FROM wildfire_members WHERE snapshot NOT IN (SELECT id FROM wildfire_snapshots); DELETE FROM wildfire_retrievals WHERE snapshot NOT IN (SELECT id FROM wildfire_snapshots); DELETE FROM wildfire_retrievals WHERE rowid NOT IN (SELECT rowid FROM wildfire_retrievals ORDER BY retrieved DESC LIMIT 1000);`)
	if e != nil {
		return d, e
	}
	return d, tx.Commit()
}
func (s *Service) latest(provider, query string) (Snapshot, error) {
	var b []byte
	var d Snapshot
	e := s.db.QueryRow(`SELECT payload FROM wildfire_snapshots WHERE provider=? AND query=? ORDER BY fetched DESC LIMIT 1`, provider, query).Scan(&b)
	if e == nil {
		e = json.Unmarshal(b, &d)
	}
	return d, e
}
func (s *Service) fetch(ctx context.Context, u string) ([]byte, error) {
	req, e := http.NewRequestWithContext(ctx, "GET", u, nil)
	if e != nil {
		return nil, fmt.Errorf("invalid provider request")
	}
	req.Header.Set("User-Agent", "HazardAtlas/0.2 local educational explorer")
	r, e := s.client.Do(req)
	if e != nil {
		return nil, fmt.Errorf("provider connection failed or timed out")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return nil, fmt.Errorf("provider HTTP %d; no automatic retry", r.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(r.Body, 16*1024*1024+1))
	if e != nil {
		return nil, fmt.Errorf("provider response interrupted")
	}
	if len(b) > 16*1024*1024 {
		return nil, fmt.Errorf("provider byte cap reached; incomplete")
	}
	return b, nil
}
func (s *Service) Retrieve(ctx context.Context, provider string, q Query) (result Snapshot, resultErr error) {
	var query, u string
	var gate *lane
	var ttl time.Duration
	if provider == "eonet" {
		query = "wildfires; status all; trailing 30 UTC days; limit 1000"
		start, end := q.Start, q.End
		if start == "" {
			start = time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02")
		}
		if end == "" {
			end = time.Now().UTC().Format("2006-01-02")
		}
		query = "wildfires; status all; " + start + " through " + end
		u = "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=all&start=" + url.QueryEscape(start) + "&end=" + url.QueryEscape(end) + "&limit=1000"
		gate = &s.eonet
		ttl = 15 * time.Minute
	} else if provider == "firms" {
		if e := q.Validate(); e != nil {
			return Snapshot{}, e
		}
		b, _ := json.Marshal(q)
		query = string(b)
		gate = &s.firms
		ttl = 10 * time.Minute
	} else if provider == "cwfis" {
		if q.Start == "" {
			q.Start = time.Now().UTC().Format("2006-01-02")
		}
		if _, err := time.Parse("2006-01-02", q.Start); err != nil {
			return Snapshot{}, fmt.Errorf("valid UTC date required")
		}
		if q.End != "" && q.End != q.Start {
			return Snapshot{}, fmt.Errorf("CWFIS hotspots support one UTC day per request")
		}
		if t, _ := time.Parse("2006-01-02", q.Start); t.After(time.Now().UTC()) {
			return Snapshot{}, fmt.Errorf("valid non-future UTC date required")
		}
		query = "CWFIS Fire M3 daily hotspots; Canada bounding box; " + q.Start + " UTC"
		gate = &s.firms
		ttl = 3 * time.Hour
	} else if provider == "cwfis-active" {
		query = "CWFIS current agency-reported active wildland fires"
		u = "https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=public:cwfif_national_activefires&outputFormat=application%2Fjson&count=50000"
		gate = &s.cwfisActive
		ttl = 15 * time.Minute
	} else {
		return Snapshot{}, fmt.Errorf("unknown provider")
	}
	gate.mu.Lock()
	defer gate.mu.Unlock()
	defer func() {
		if resultErr == nil {
			gate.last = result
		}
	}()
	d := Snapshot{Schema: 1, Provider: provider, Product: Product, Query: query, State: "failed", Incidents: []Incident{}, Detections: []Detection{}, Sources: []Source{}}
	if provider == "cwfis" {
		d.Product = "CWFIS Fire M3"
	} else if provider == "cwfis-active" {
		d.Product = "CWFIS Active Wildland Fires"
	}
	if provider == "firms" {
		d.Coverage = &q
		if s.key == "" {
			d.State = "unconfigured"
			d.Error = "Set HAZARD_ATLAS_FIRMS_MAP_KEY on the server, then restart. Frozen observations remain available."
			return d, nil
		}
	} else if provider == "eonet" {
		d.Product = "EONET v3"
	}
	if provider == "cwfis" {
		d.Coverage = &Query{West: -141, South: 41, East: -52, North: 83, Start: q.Start, Days: 1}
	}
	previous, cacheErr := s.latest(provider, query)
	if time.Now().Before(gate.next) {
		if gate.last.Query == query && gate.last.State != "" {
			return gate.last, nil
		}
		if cacheErr == nil {
			return previous, nil
		}
		d.Error = "Provider request budget cooling down; try again after the refresh interval."
		return d, nil
	}
	if cacheErr == nil {
		t, _ := time.Parse(time.RFC3339Nano, previous.Fetched)
		if time.Since(t) < ttl {
			return previous, nil
		}
	}
	gate.next = time.Now().Add(ttl)
	var raw []byte
	var err error
	if provider == "eonet" {
		raw, err = s.fetch(ctx, u)
		if err == nil {
			d.Incidents, err = ParseEONET(raw)
		}
		d.Sources = []Source{{"NASA EONET", u}}
	} else if provider == "firms" {
		chunks := []json.RawMessage{}
		d.Detections = []Detection{}
		seen := map[string]int{}
		for _, part := range q.Parts() {
			u = fmt.Sprintf("https://firms.modaps.eosdis.nasa.gov/api/area/csv/%s/%s/%g,%g,%g,%g/%d/%s", url.PathEscape(s.key), Product, part.West, part.South, part.East, part.North, q.Days, q.Start)
			var b []byte
			b, err = s.fetch(ctx, u)
			if err != nil {
				break
			}
			var ds []Detection
			ds, err = ParseFIRMS(b)
			if err != nil {
				break
			}
			encoded, _ := json.Marshal(string(b))
			chunks = append(chunks, encoded)
			for _, v := range ds {
				start, _ := time.Parse("2006-01-02", q.Start)
				acq, _ := time.Parse(time.RFC3339, v.Acquisition)
				insideLon := v.Longitude >= q.West && v.Longitude <= q.East
				if q.West > q.East {
					insideLon = v.Longitude >= q.West || v.Longitude <= q.East
				}
				if !insideLon || v.Latitude < q.South || v.Latitude > q.North || acq.Before(start) || !acq.Before(start.Add(time.Duration(q.Days)*24*time.Hour)) {
					err = fmt.Errorf("provider returned observations outside requested coverage")
					break
				}

				if at, ok := seen[v.ID]; ok {
					d.Detections[at] = v
				} else {
					seen[v.ID] = len(d.Detections)
					d.Detections = append(d.Detections, v)
				}
			}
			if err != nil {
				break
			}
			if len(d.Detections) > MaxRecords {
				err = fmt.Errorf("combined detection cap reached; incomplete")
				break
			}
		}
		raw, _ = json.Marshal(chunks)
		d.Sources = []Source{{"NASA FIRMS", "https://firms.modaps.eosdis.nasa.gov/api/area/"}}
	} else if provider == "cwfis" {
		raw, err = s.fetch(ctx, "https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/"+strings.ReplaceAll(q.Start, "-", "")+".csv")
		if err == nil {
			d.Detections, err = ParseCWFISHotspots(raw)
		}
		d.Sources = []Source{{"Natural Resources Canada CWFIS", "https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/"}}
	} else {
		raw, err = s.fetch(ctx, u)
		if err == nil {
			d.Incidents, err = ParseCWFISActiveFires(raw)
		}
		d.Sources = []Source{{"Natural Resources Canada CWFIS Active Wildland Fires", u}}
	}
	// A capped EONET page is still useful after every returned incident has
	// passed validation. Preserve those records and their incomplete status.
	if err == errEONETCap {
		d.Fetched = time.Now().UTC().Format(time.RFC3339Nano)
		d.State = "partial"
		d.Complete = false
		d.Error = err.Error()
		return s.save(d, raw)
	}
	if err != nil {
		if cacheErr == nil {
			d = previous
			d.State = "stale"
		} else {
			d.Incidents = []Incident{}
			d.Detections = []Detection{}
			d.State = "failed"
		}
		d.Error = err.Error()
		if strings.Contains(err.Error(), "cap") {
			d.State = "partial"
		}
		return d, nil
	}
	d.Fetched = time.Now().UTC().Format(time.RFC3339Nano)
	d.Complete = true
	d.State = "ready"
	if len(d.Incidents)+len(d.Detections) == 0 {
		d.State = "empty"
	}
	return s.save(d, raw)
}
func (s *Service) Demo(provider string) (Snapshot, error) {
	meta, _ := fixtures.ReadFile("testdata/provenance.json")
	var provenance struct{ Retrieved string }
	json.Unmarshal(meta, &provenance)
	d := Snapshot{Schema: 1, Provider: provider, Product: Product, Fetched: provenance.Retrieved, Demo: true, State: "demo", Complete: true, Incidents: []Incident{}, Detections: []Detection{}}
	var raw []byte
	var e error
	if provider == "eonet" {
		raw, _ = fixtures.ReadFile("testdata/eonet.json")
		d.Product = "EONET v3"
		d.Query = "Frozen curated records, 2026-09-01 through 2026-09-05 inclusive, global"
		d.Incidents, e = ParseEONET(raw)
		d.Sources = []Source{{"NASA EONET", "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=all&start=2026-09-01&end=2026-09-05&limit=1000"}}
	} else if provider == "firms" {
		raw, _ = fixtures.ReadFile("testdata/firms.csv")
		d.Query = "Frozen western US spatial subset of public NOAA-20 24-hour file; acquisition 2026-09-05; coverage not guaranteed"
		d.Coverage = &Query{West: -125, South: 30, East: -110, North: 49, Start: "2026-09-05", Days: 1}
		d.Detections, e = ParseFIRMS(raw)
		d.Sources = []Source{{"NASA FIRMS", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv"}}
	} else if provider == "cwfis" {
		raw, _ = fixtures.ReadFile("testdata/cwfis-canada.csv")
		d.Query = "Frozen CWFIS Fire M3 Canada hotspots; 2026-09-05 UTC; Canada spatial subset"
		d.Coverage = &Query{West: -141, South: 41, East: -52, North: 83, Start: "2026-09-05", Days: 1}
		d.Detections, e = ParseCWFISHotspots(raw)
		d.Product = "CWFIS Fire M3"
		d.Sources = []Source{{"Natural Resources Canada CWFIS", "https://cwfis.cfs.nrcan.gc.ca/downloads/hotspots/20260905.csv"}}
	} else {
		return d, fmt.Errorf("unknown provider")
	}
	if e != nil {
		return d, e
	}
	return s.save(d, raw)
}
func (s *Service) Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	provider := r.PathValue("provider")
	var d Snapshot
	var err error
	if r.URL.Query().Get("demo") == "true" {
		d, err = s.Demo(provider)
	} else {
		q := Query{}
		if provider == "eonet" {
			q.Start, q.End = r.URL.Query().Get("start"), r.URL.Query().Get("end")
		} else if provider == "firms" || provider == "cwfis" {
			if e := json.Unmarshal([]byte(r.URL.Query().Get("query")), &q); e != nil {
				http.Error(w, `{"error":"valid query JSON required"}`, 400)
				return
			}
		}
		d, err = s.Retrieve(r.Context(), provider, q)
	}
	if err != nil {
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(d)
}
