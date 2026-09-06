package wildfire

import (
	"context"
	"earthquake-observatory/internal/observatory"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestFixtures(t *testing.T) {
	b, _ := fixtures.ReadFile("testdata/eonet.json")
	is, e := ParseEONET(b)
	if e != nil || len(is) == 0 {
		t.Fatalf("EONET: %v", e)
	}
	b, _ = fixtures.ReadFile("testdata/firms.csv")
	ds, e := ParseFIRMS(b)
	if e != nil || len(ds) != 97 {
		t.Fatalf("FIRMS: %d %v", len(ds), e)
	}
	if ds[0].Product != Product || ds[0].Satellite != "NOAA-20" {
		t.Fatal("product")
	}
	b, _ = fixtures.ReadFile("testdata/cwfis-canada.csv")
	ca, e := ParseCWFISHotspots(b)
	if e != nil || len(ca) != 309 {
		t.Fatalf("CWFIS: %d %v", len(ca), e)
	}
	if ca[0].Product != "CWFIS_FIREM3_HOTSPOTS" {
		t.Fatal("CWFIS product")
	}
}
func TestFIRMSIdentityAndValidation(t *testing.T) {
	b, _ := fixtures.ReadFile("testdata/firms.csv")
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	one := lines[0] + "\n" + lines[1] + "\n"
	ds, e := ParseFIRMS([]byte(one + lines[1] + "\n"))
	if e != nil || len(ds) != 1 {
		t.Fatal("dedup", e)
	}
	record := strings.Split(lines[1], ",")
	record[6] = "1234"
	other := strings.Join(record, ",")
	ds, e = ParseFIRMS([]byte(one + other + "\n"))
	if e != nil || len(ds) != 2 {
		t.Fatal("overpass merged", e)
	}
	for _, raw := range []string{"", "latitude,longitude\n0,0", strings.Replace(one, "nominal", "bad", 1), strings.Replace(one, "N20", "N21", 1), strings.Replace(one, "2026-09-05", "2026-02-30", 1), one + "bad\n"} {
		if _, e = ParseFIRMS([]byte(raw)); e == nil {
			t.Fatalf("accepted invalid CSV %q", raw)
		}
	}
	record = strings.Split(lines[1], ",")
	record[2] = ""
	record[11] = "0"
	ds, e = ParseFIRMS([]byte(lines[0] + "\n" + strings.Join(record, ",") + "\n"))
	if e != nil || ds[0].BrightI4 != nil || ds[0].FRP == nil || *ds[0].FRP != 0 {
		t.Fatal("null vs zero", e)
	}
}
func TestBounds(t *testing.T) {
	q := Query{West: 170, South: -10, East: -175, North: 10, Start: "2026-09-01", Days: 2}
	if q.Validate() != nil || len(q.Parts()) != 2 || q.Parts()[0].East != 180 || q.Parts()[1].West != -180 {
		t.Fatal("date line")
	}
	for _, q := range []Query{{West: -180, South: -90, East: 180, North: 90, Start: "2026-09-01", Days: 1}, {West: 10, South: 20, East: 0, North: 30, Start: "2026-09-01", Days: 1}, {West: 0, South: 0, East: 10, North: 10, Start: "bad", Days: 1}, {West: 0, South: 0, East: 10, North: 10, Start: "2026-09-01", Days: 6}} {
		if q.Validate() == nil {
			t.Fatal("unbounded query accepted")
		}
	}
}
func TestEONETPrecisionAndPolygons(t *testing.T) {
	raw := `{"events":[{"id":"A","title":"Real schema fixture","categories":[{"id":"wildfires"}],"closed":null,"geometry":[{"type":"Point","coordinates":[179,80],"date":"2026-09-01T00:00:00Z"},{"type":"Polygon","coordinates":[[[179,0],[-179,0],[-179,1],[179,1],[179,0]]],"date":"2026-09-02T12:34:00Z"}]}]}`
	is, e := ParseEONET([]byte(raw))
	if e != nil || is[0].Geometry[0].Precision != "day" || is[0].Geometry[0].Date != "2026-09-01" || is[0].Geometry[1].Precision != "second" {
		t.Fatal(e)
	}
	if _, e = ParseEONET([]byte(strings.Replace(raw, "179,80", "181,80", 1))); e == nil {
		t.Fatal("invalid coordinate")
	}
	if _, e = ParseEONET([]byte(`{"error":"unavailable"}`)); e == nil {
		t.Fatal("bad envelope")
	}
}
func testService(t *testing.T) *Service {
	t.Helper()
	st, e := observatory.Open(filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { st.DB.Close() })
	s, e := New(st.DB, "")
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func TestSnapshotsAndMissingKey(t *testing.T) {
	s := testService(t)
	a, e := s.Demo("firms")
	if e != nil {
		t.Fatal(e)
	}
	b, e := s.Demo("firms")
	if e != nil || a.ID != b.ID {
		t.Fatal("identity", e)
	}
	var count int
	s.db.QueryRow(`SELECT count(*) FROM wildfire_members`).Scan(&count)
	if count != 97 {
		t.Fatal("duplicate membership", count)
	}
	d, e := s.Retrieve(context.Background(), "firms", Query{West: -125, South: 30, East: -110, North: 49, Start: "2026-09-05", Days: 1})
	if e != nil || d.State != "unconfigured" || d.Fetched != "" || d.Complete {
		t.Fatal("missing key misrepresented", d, e)
	}
}
func TestBoundedFailureAndCoalescing(t *testing.T) {
	s := testService(t)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		b, _ := fixtures.ReadFile("testdata/eonet.json")
		w.Write(b)
	}))
	defer server.Close()
	s.client = &http.Client{Transport: rewriteTransport{base: server.URL}}
	a, e := s.Retrieve(context.Background(), "eonet", Query{})
	if e != nil || !a.Complete {
		t.Fatal(e, a.Error)
	}
	b, e := s.Retrieve(context.Background(), "eonet", Query{})
	if e != nil || b.ID != a.ID || calls != 1 {
		t.Fatal("not coalesced")
	}
	s.eonet.next = s.eonet.next.Add(-24 * 60 * 60 * 1e9)
	s.db.Exec(`DELETE FROM wildfire_snapshots`)
	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "key must never surface", 429) })
	d, e := s.Retrieve(context.Background(), "eonet", Query{})
	if e != nil || d.State != "failed" || strings.Contains(d.Error, "key") {
		t.Fatal("unsafe failure", d, e)
	}
	raw, _ := json.Marshal(d)
	if strings.Contains(string(raw), server.URL) {
		t.Fatal("leaked URL")
	}
}

type rewriteTransport struct{ base string }

func (rt rewriteTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	req, _ := http.NewRequestWithContext(r.Context(), r.Method, rt.base, nil)
	return http.DefaultTransport.RoundTrip(req)
}

func TestCappedEONETPreservesValidatedIncidents(t *testing.T) {
	s := testService(t)
	var records []json.RawMessage
	for i := 0; i < 1000; i++ {
		id, _ := json.Marshal(strconv.Itoa(i))
		records = append(records, json.RawMessage(`{"id":`+string(id)+`,"title":"Wildfire","categories":[{"id":"wildfires"}],"geometry":[{"type":"Point","coordinates":[-120,40],"date":"2026-09-05T12:00:00Z"}]}`))
	}
	raw, _ := json.Marshal(map[string]any{"events": records})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(raw) }))
	defer server.Close()
	s.client = &http.Client{Transport: rewriteTransport{base: server.URL}}
	d, err := s.Retrieve(context.Background(), "eonet", Query{})
	if err != nil || d.State != "partial" || d.Complete || len(d.Incidents) != 1000 || d.ID == "" || d.Fetched == "" || d.Error == "" {
		t.Fatalf("capped records lost or presented as complete: state=%s count=%d error=%v", d.State, len(d.Incidents), err)
	}
	cached, err := s.Retrieve(context.Background(), "eonet", Query{})
	if err != nil || cached.ID != d.ID || cached.Complete || len(cached.Incidents) != 1000 {
		t.Fatal("partial snapshot not preserved")
	}
	records[999] = json.RawMessage(`{"id":"invalid","title":"Bad","categories":[{"id":"wildfires"}],"geometry":[{"type":"Point","coordinates":[999,40],"date":"2026-09-05T12:00:00Z"}]}`)
	bad, _ := json.Marshal(map[string]any{"events": records})
	incidents, err := ParseEONET(bad)
	if err == nil || err == errEONETCap || len(incidents) != 0 {
		t.Fatal("cap bypassed validation")
	}
}
