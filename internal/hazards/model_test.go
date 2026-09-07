package hazards

import (
	"os"
	"testing"
)

func TestParseEONETExcludesWildfiresAndEarthquakes(t *testing.T) {
	raw, err := os.ReadFile("testdata/eonet.json")
	if err != nil {
		t.Fatal(err)
	}
	records, err := ParseEONET(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 6 {
		t.Fatalf("expected 6 records, got %d", len(records))
	}
	for _, r := range records {
		if r.Category == "wildfires" || r.Category == "earthquakes" {
			t.Fatalf("wildfires/earthquakes must never come from this package, got category %q", r.Category)
		}
		if r.AlertLevel == "" {
			t.Fatalf("every record must have an alert level, even if unknown")
		}
	}
}
func TestParseEONETMultiPointGeometryPreserved(t *testing.T) {
	raw, err := os.ReadFile("testdata/eonet.json")
	if err != nil {
		t.Fatal(err)
	}
	records, err := ParseEONET(raw)
	if err != nil {
		t.Fatal(err)
	}
	var cyclone *Record
	for i := range records {
		if records[i].ID == "eonet:EONET_00001" {
			cyclone = &records[i]
		}
	}
	if cyclone == nil {
		t.Fatal("cyclone record missing")
	}
	if len(cyclone.Geometry) != 4 {
		t.Fatalf("expected full 4-point track preserved, got %d points", len(cyclone.Geometry))
	}
	if cyclone.StartDate != cyclone.Geometry[0].Date || cyclone.EndDate != cyclone.Geometry[len(cyclone.Geometry)-1].Date {
		t.Fatal("start/end date must bracket the geometry array, not flatten to one point")
	}
}
func TestJoinMatchesByGDACSEventID(t *testing.T) {
	eonetRaw, _ := os.ReadFile("testdata/eonet.json")
	gdacsRaw, _ := os.ReadFile("testdata/gdacs.json")
	eonet, err := ParseEONET(eonetRaw)
	if err != nil {
		t.Fatal(err)
	}
	gdacs, err := ParseGDACS(gdacsRaw)
	if err != nil {
		t.Fatal(err)
	}
	if len(gdacs) != 3 {
		t.Fatalf("expected 3 GDACS events, got %d", len(gdacs))
	}
	joined := Join(eonet, gdacs)
	byID := map[string]Record{}
	for _, r := range joined {
		byID[r.ID] = r
	}
	if got := byID["eonet:EONET_00001"].AlertLevel; got != "red" {
		t.Fatalf("cyclone should join to red, got %q", got)
	}
	if got := byID["eonet:EONET_00002"].AlertLevel; got != "orange" {
		t.Fatalf("volcano should join to orange, got %q", got)
	}
	// EONET_00003 has no GDACS source at all.
	if got := byID["eonet:EONET_00003"].AlertLevel; got != "unknown" {
		t.Fatalf("no GDACS source must stay unknown, never default to green, got %q", got)
	}
	// EONET_00005 has a GDACS source URL but no matching GDACS event in this window.
	if got := byID["eonet:EONET_00005"].AlertLevel; got != "unknown" {
		t.Fatalf("unmatched GDACS eventid must stay unknown, never default to green, got %q", got)
	}
	if got := byID["eonet:EONET_00004"].AlertLevel; got != "green" {
		t.Fatalf("drought should join to green, got %q", got)
	}
}
func TestJoinProducesExactlyOneMarkerPerEvent(t *testing.T) {
	eonetRaw, _ := os.ReadFile("testdata/eonet.json")
	gdacsRaw, _ := os.ReadFile("testdata/gdacs.json")
	eonet, _ := ParseEONET(eonetRaw)
	gdacs, _ := ParseGDACS(gdacsRaw)
	joined := Join(eonet, gdacs)
	if len(joined) != len(eonet) {
		t.Fatalf("Join must not add or drop records: %d in, %d out", len(eonet), len(joined))
	}
}
