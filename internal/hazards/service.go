package hazards

import (
	"context"
	"database/sql"
	"earthquake-observatory/internal/wildfire"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed testdata/*
var fixtures embed.FS

type Snapshot struct {
	ID       string            `json:"id"`
	Schema   int               `json:"schema"`
	Product  string            `json:"product"`
	Query    string            `json:"query"`
	Fetched  string            `json:"fetched"`
	State    string            `json:"state"`
	Complete bool              `json:"complete"`
	Demo     bool              `json:"demo"`
	Error    string            `json:"error,omitempty"`
	Records  []Record          `json:"records"`
	Sources  []wildfire.Source `json:"sources"`
}
type lane struct {
	mu   sync.Mutex
	next time.Time
	last Snapshot
}
type Service struct {
	db     *sql.DB
	client *http.Client
	gate   lane
}

func New(db *sql.DB) (*Service, error) {
	_, e := db.Exec(`CREATE TABLE IF NOT EXISTS hazard_snapshots(id TEXT PRIMARY KEY,query TEXT NOT NULL,fetched TEXT NOT NULL,payload BLOB NOT NULL);
 CREATE INDEX IF NOT EXISTS hazard_query ON hazard_snapshots(query,fetched);
 CREATE TABLE IF NOT EXISTS hazard_retrievals(snapshot TEXT NOT NULL,retrieved TEXT NOT NULL,PRIMARY KEY(snapshot,retrieved));
 INSERT OR IGNORE INTO schema_version VALUES(3);`)
	return &Service{db: db, client: &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return fmt.Errorf("redirect denied") }}}, e
}
func (s *Service) save(d Snapshot, raw []byte) (Snapshot, error) {
	d.ID = hash(append([]byte(d.Query+"\n"), raw...))
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
	if _, e = tx.Exec(`INSERT OR IGNORE INTO hazard_snapshots VALUES(?,?,?,?)`, d.ID, d.Query, d.Fetched, payload); e != nil {
		return d, e
	}
	if _, e = tx.Exec(`INSERT OR IGNORE INTO hazard_retrievals VALUES(?,?)`, d.ID, d.Fetched); e != nil {
		return d, e
	}
	_, e = tx.Exec(`DELETE FROM hazard_snapshots WHERE id NOT IN (SELECT snapshot FROM hazard_retrievals GROUP BY snapshot ORDER BY MAX(retrieved) DESC LIMIT 40); DELETE FROM hazard_retrievals WHERE snapshot NOT IN (SELECT id FROM hazard_snapshots); DELETE FROM hazard_retrievals WHERE rowid NOT IN (SELECT rowid FROM hazard_retrievals ORDER BY retrieved DESC LIMIT 1000);`)
	if e != nil {
		return d, e
	}
	return d, tx.Commit()
}
func (s *Service) latest(query string) (Snapshot, error) {
	var b []byte
	var d Snapshot
	e := s.db.QueryRow(`SELECT payload FROM hazard_snapshots WHERE query=? ORDER BY fetched DESC LIMIT 1`, query).Scan(&b)
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
	req.Header.Set("User-Agent", "HazardAtlas/0.3 local educational explorer")
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

const ttl = 15 * time.Minute

// gdacsTimeout bounds the severity overlay independently of the 25s client
// timeout: past this the events are worth more than the wait.
const gdacsTimeout = 15 * time.Second

// Retrieve fetches EONET's non-wildfire, non-earthquake categories and joins
// GDACS severity, behind the same rate-limited, TTL-cached "lane" gate
// internal/wildfire uses per provider — here there is one lane because both
// upstream calls are made together and cached as a single joined snapshot.
func (s *Service) Retrieve(ctx context.Context, days int) (result Snapshot, resultErr error) {
	if days <= 0 {
		days = 30
	}
	query := "hazards; all categories except wildfires and earthquakes; trailing " + strconv.Itoa(days) + " UTC days"
	s.gate.mu.Lock()
	defer s.gate.mu.Unlock()
	defer func() {
		if resultErr == nil {
			s.gate.last = result
		}
	}()
	d := Snapshot{Schema: 1, Product: "EONET v3 + GDACS", Query: query, Records: []Record{}, Sources: []wildfire.Source{}}
	previous, cacheErr := s.latest(query)
	if time.Now().Before(s.gate.next) {
		if s.gate.last.Query == query && s.gate.last.State != "" {
			return s.gate.last, nil
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
	s.gate.next = time.Now().Add(ttl)
	eonetURL := eonetEventsURL(days)
	to := time.Now().UTC().Format("2006-01-02")
	from := time.Now().UTC().AddDate(0, 0, -days).Format("2006-01-02")
	gdacsURL := gdacsSearchURL(from, to)
	// GDACS is an overlay, not the event source, and it is routinely slow
	// (7-25s observed, sometimes exceeding the client timeout outright).
	// Start it alongside EONET under its own shorter deadline so a slow
	// overlay adds no latency of its own and can never hold the events
	// hostage; a miss just leaves every record unassessed.
	gdacsCtx, cancelGDACS := context.WithTimeout(ctx, gdacsTimeout)
	defer cancelGDACS()
	type fetched struct {
		raw []byte
		err error
	}
	gdacsDone := make(chan fetched, 1)
	go func() {
		raw, err := s.fetch(gdacsCtx, gdacsURL)
		gdacsDone <- fetched{raw, err}
	}()
	eonetRaw, err := s.fetch(ctx, eonetURL)
	var records []Record
	if err == nil {
		records, err = ParseEONET(eonetRaw)
		if err != nil && strings.Contains(err.Error(), "cap") {
			d.State = "partial"
			d.Error = err.Error()
			err = nil
		}
	}
	if err != nil {
		if cacheErr == nil {
			d = previous
			d.State = "stale"
		} else {
			d.State = "failed"
		}
		d.Error = err.Error()
		return d, nil
	}
	gdacsResult := <-gdacsDone
	gdacsRaw, gErr := gdacsResult.raw, gdacsResult.err
	var gdacs []GDACSEvent
	if gErr == nil {
		gdacs, gErr = ParseGDACS(gdacsRaw)
	}
	if gErr != nil {
		// GDACS is a severity overlay, not the primary event source: keep the
		// EONET records with alertLevel "unknown" rather than failing the
		// whole snapshot when only the overlay is unavailable.
		records = Join(records, nil)
		d.State = "partial"
		d.Error = "GDACS severity overlay unavailable (" + gErr.Error() + "); every hazard shows as unassessed rather than a guessed severity."
	} else {
		records = Join(records, gdacs)
		if d.State == "" {
			d.State = "ready"
		} // else: keep the "partial" state and error already set by an EONET record cap
	}
	d.Records = records
	d.Sources = []wildfire.Source{{ID: "NASA EONET", URL: eonetURL}, {ID: "GDACS", URL: gdacsURL}}
	d.Fetched = time.Now().UTC().Format(time.RFC3339Nano)
	d.Complete = true
	if len(d.Records) == 0 {
		d.State = "empty"
	}
	raw, _ := json.Marshal(struct {
		EONET json.RawMessage
		GDACS json.RawMessage
	}{eonetRaw, gdacsRaw})
	return s.save(d, raw)
}
func (s *Service) Demo() (Snapshot, error) {
	meta, _ := fixtures.ReadFile("testdata/provenance.json")
	var provenance struct{ Retrieved string }
	json.Unmarshal(meta, &provenance)
	d := Snapshot{Schema: 1, Product: "EONET v3 + GDACS", Fetched: provenance.Retrieved, Demo: true, State: "demo", Complete: true, Records: []Record{}}
	eonetRaw, _ := fixtures.ReadFile("testdata/eonet.json")
	gdacsRaw, _ := fixtures.ReadFile("testdata/gdacs.json")
	d.Query = "Frozen curated records, all categories except wildfires and earthquakes"
	records, e := ParseEONET(eonetRaw)
	if e != nil {
		return d, e
	}
	gdacs, e := ParseGDACS(gdacsRaw)
	if e != nil {
		return d, e
	}
	d.Records = Join(records, gdacs)
	d.Sources = []wildfire.Source{
		{ID: "NASA EONET", URL: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=1000"},
		{ID: "GDACS", URL: "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH"},
	}
	raw, _ := json.Marshal(struct {
		EONET json.RawMessage
		GDACS json.RawMessage
	}{eonetRaw, gdacsRaw})
	return s.save(d, raw)
}
func (s *Service) Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	var d Snapshot
	var err error
	if r.URL.Query().Get("demo") == "true" {
		d, err = s.Demo()
	} else {
		days, _ := strconv.Atoi(r.URL.Query().Get("days"))
		d, err = s.Retrieve(r.Context(), days)
	}
	if err != nil {
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(d)
}
