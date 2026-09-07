// Package hazards ingests NASA EONET's non-wildfire, non-earthquake event
// categories and joins in GDACS severity. Wildfires stay on internal/wildfire
// and earthquakes stay on internal/observatory (USGS); this package never
// becomes an alternate source for either, it only covers the other eleven
// EONET categories.
package hazards

import (
	"crypto/sha256"
	"earthquake-observatory/internal/wildfire"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Categories are every EONET category this package renders, i.e. all of them
// except "wildfires" (internal/wildfire) and "earthquakes" (USGS, via
// internal/observatory) — see the package doc comment.
var Categories = map[string]bool{
	"volcanoes":    true,
	"severeStorms": true,
	"floods":       true,
	"landslides":   true,
	"drought":      true,
	"dustHaze":     true,
	"seaLakeIce":   true,
	"snow":         true,
	"tempExtremes": true,
	"waterColor":   true,
	"manmade":      true,
}

type Geometry struct {
	Date           string          `json:"date"`
	Type           string          `json:"type"`
	Coordinates    json.RawMessage `json:"coordinates"`
	Precision      string          `json:"precision"`
	MagnitudeValue *float64        `json:"magnitudeValue,omitempty"`
	MagnitudeUnit  *string         `json:"magnitudeUnit,omitempty"`
}

// Record is the shape both renderers consume. Neither renderer, nor anything
// outside this package, should need to know EONET or GDACS exist.
type Record struct {
	ID           string     `json:"id"`
	Category     string     `json:"category"`
	Title        string     `json:"title"`
	Geometry     []Geometry `json:"geometry"`
	StartDate    string     `json:"startDate"`
	EndDate      string     `json:"endDate"`
	Closed       bool       `json:"closed"`
	AlertLevel   string     `json:"alertLevel"`
	SeverityText string     `json:"severityText"`
	SourceURLs   []string   `json:"sourceUrls"`
	// gdacsEventID is the join key extracted from the EONET record's own
	// GDACS source URL, if it has one. Not serialized; consumed by Join.
	gdacsEventID string
}
type GDACSEvent struct {
	EventID      string
	AlertLevel   string
	SeverityText string
}

func hash(raw []byte) string { s := sha256.Sum256(raw); return hex.EncodeToString(s[:]) }
func validPoint(p []float64) bool {
	return len(p) == 2 && !math.IsNaN(p[0]) && !math.IsNaN(p[1]) && math.Abs(p[0]) <= 180 && math.Abs(p[1]) <= 90
}
func validateGeometry(g Geometry) bool {
	if g.Type == "Point" {
		var p []float64
		return json.Unmarshal(g.Coordinates, &p) == nil && validPoint(p)
	}
	if g.Type == "Polygon" {
		var rings [][][]float64
		if json.Unmarshal(g.Coordinates, &rings) != nil || len(rings) == 0 {
			return false
		}
		for _, r := range rings {
			if len(r) < 4 {
				return false
			}
			for _, p := range r {
				if !validPoint(p) {
					return false
				}
			}
			a, b := r[0], r[len(r)-1]
			if a[0] != b[0] || a[1] != b[1] {
				return false
			}
		}
		return true
	}
	return false
}

// gdacsEventIDFromURL extracts the eventid query parameter GDACS-sourced
// EONET events carry, e.g.
// "https://www.gdacs.org/report.aspx?eventtype=WF&eventid=1023712" -> "1023712".
func gdacsEventIDFromURL(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	id := u.Query().Get("eventid")
	return id, id != ""
}

// ParseEONET reads the plain (non-geojson) EONET events envelope, which is
// the only variant that carries both per-point dated geometry and the
// sources array the GDACS join depends on; the events/geojson variant drops
// sources entirely.
func ParseEONET(raw []byte) ([]Record, error) {
	var v struct {
		Events []struct {
			ID         string
			Title      string
			Closed     *string
			Sources    []wildfire.Source
			Categories []struct{ ID string }
			Geometry   []Geometry
		}
	}
	if e := json.Unmarshal(raw, &v); e != nil || v.Events == nil {
		return nil, fmt.Errorf("invalid EONET event envelope")
	}
	if len(v.Events) > 1000 {
		return nil, fmt.Errorf("EONET response exceeds the 1000-record cap")
	}
	out := []Record{}
	seen := map[string]bool{}
	for _, e := range v.Events {
		category := ""
		for _, c := range e.Categories {
			if Categories[c.ID] {
				category = c.ID
				break
			}
		}
		if category == "" {
			continue
		}
		if e.ID == "" || e.Title == "" || len(e.Geometry) == 0 {
			return nil, fmt.Errorf("invalid EONET event")
		}
		id := "eonet:" + e.ID
		if seen[id] {
			return nil, fmt.Errorf("duplicate EONET ID")
		}
		seen[id] = true
		if e.Closed != nil {
			if _, err := time.Parse(time.RFC3339, *e.Closed); err != nil {
				return nil, fmt.Errorf("invalid closed date")
			}
		}
		for i := range e.Geometry {
			g := &e.Geometry[i]
			if !validateGeometry(*g) {
				return nil, fmt.Errorf("invalid EONET geometry")
			}
			t, err := time.Parse(time.RFC3339, g.Date)
			if err != nil {
				t, err = time.Parse("2006-01-02", g.Date)
			}
			if err != nil {
				return nil, fmt.Errorf("invalid geometry date")
			}
			g.Precision = "second"
			if t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 {
				g.Precision = "day"
				g.Date = t.Format("2006-01-02")
			}
		}
		sort.SliceStable(e.Geometry, func(i, j int) bool { return e.Geometry[i].Date < e.Geometry[j].Date })
		urls := make([]string, 0, len(e.Sources))
		gdacsID := ""
		for _, src := range e.Sources {
			urls = append(urls, src.URL)
			if src.ID == "GDACS" {
				if id, ok := gdacsEventIDFromURL(src.URL); ok {
					gdacsID = id
				}
			}
		}
		out = append(out, Record{
			ID:           id,
			Category:     category,
			Title:        e.Title,
			Geometry:     e.Geometry,
			StartDate:    e.Geometry[0].Date,
			EndDate:      e.Geometry[len(e.Geometry)-1].Date,
			Closed:       e.Closed != nil,
			AlertLevel:   "unknown",
			SourceURLs:   urls,
			gdacsEventID: gdacsID,
		})
	}
	if len(v.Events) == 1000 {
		return out, fmt.Errorf("EONET response reached the 1000-record cap; showing available events, retrieval incomplete")
	}
	return out, nil
}

// ParseGDACS reads the GDACS event-list GeoJSON search endpoint.
func ParseGDACS(raw []byte) ([]GDACSEvent, error) {
	var v struct {
		Features []struct {
			Properties struct {
				EventID    json.Number `json:"eventid"`
				AlertLevel string      `json:"alertlevel"`
				Severity   struct {
					SeverityText string `json:"severitytext"`
				} `json:"severitydata"`
			} `json:"properties"`
		} `json:"features"`
	}
	if e := json.Unmarshal(raw, &v); e != nil {
		return nil, fmt.Errorf("invalid GDACS event envelope")
	}
	out := make([]GDACSEvent, 0, len(v.Features))
	for _, f := range v.Features {
		if f.Properties.EventID == "" {
			continue
		}
		out = append(out, GDACSEvent{
			EventID:      string(f.Properties.EventID),
			AlertLevel:   strings.ToLower(strings.TrimSpace(f.Properties.AlertLevel)),
			SeverityText: strings.TrimSpace(f.Properties.Severity.SeverityText),
		})
	}
	return out, nil
}

// Join attaches GDACS severity onto matching EONET records by the eventid
// parsed from each record's own GDACS source URL — EONET already ingests
// GDACS as an upstream source, so this is a same-provider join, not a
// geographic or fuzzy match. Records with no GDACS match keep the "unknown"
// alert level Parsed set by ParseEONET; absence of a severity assessment is
// not evidence of low severity, so it is never defaulted to green.
func Join(eonet []Record, gdacs []GDACSEvent) []Record {
	byID := make(map[string]GDACSEvent, len(gdacs))
	for _, g := range gdacs {
		byID[g.EventID] = g
	}
	out := make([]Record, len(eonet))
	for i, r := range eonet {
		out[i] = r
		if r.gdacsEventID == "" {
			continue
		}
		g, ok := byID[r.gdacsEventID]
		if !ok {
			continue
		}
		level := g.AlertLevel
		if level != "red" && level != "orange" && level != "green" {
			level = "unknown"
		}
		out[i].AlertLevel = level
		out[i].SeverityText = g.SeverityText
	}
	return out
}

func gdacsSearchURL(from, to string) string {
	return "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH?fromdate=" + url.QueryEscape(from) + "&todate=" + url.QueryEscape(to)
}
func eonetEventsURL(days int) string {
	return "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=" + strconv.Itoa(days) + "&limit=1000"
}
