// Package wildfire keeps curated incidents distinct from satellite measurements.
package wildfire

import (
	"bytes"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

const Product = "VIIRS_NOAA20_NRT"
const MaxRecords = 50000

var errEONETCap = errors.New("EONET response reached the 1000-record cap; showing available incidents, retrieval incomplete")

type Geometry struct {
	Type        string          `json:"type"`
	Coordinates json.RawMessage `json:"coordinates"`
	Date        string          `json:"date"`
	Precision   string          `json:"precision"`
}
type Source struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}
type Incident struct {
	ID          string     `json:"id"`
	SourceID    string     `json:"sourceId"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Closed      *string    `json:"closed"`
	Status      string     `json:"status"`
	Sources     []Source   `json:"sources"`
	Geometry    []Geometry `json:"geometry"`
}
type Detection struct {
	ID          string   `json:"id"`
	Acquisition string   `json:"acquisition"`
	Precision   string   `json:"precision"`
	Longitude   float64  `json:"longitude"`
	Latitude    float64  `json:"latitude"`
	Satellite   string   `json:"satellite"`
	Instrument  string   `json:"instrument"`
	Product     string   `json:"product"`
	Version     string   `json:"version"`
	Confidence  string   `json:"confidence"`
	DayNight    string   `json:"dayNight"`
	BrightI4    *float64 `json:"brightI4"`
	BrightI5    *float64 `json:"brightI5"`
	FRP         *float64 `json:"frp"`
	Scan        *float64 `json:"scan"`
	Track       *float64 `json:"track"`
	Agency      string   `json:"agency,omitempty"`
	SourceCode  string   `json:"sourceCode,omitempty"`
	Fuel        string   `json:"fuel,omitempty"`
	FWI         *float64 `json:"fwi,omitempty"`
	ROS         *float64 `json:"ros,omitempty"`
	HFI         *float64 `json:"hfi,omitempty"`
	SFC         *float64 `json:"sfc,omitempty"`
	TFC         *float64 `json:"tfc,omitempty"`
}
type Query struct {
	West  float64 `json:"west"`
	South float64 `json:"south"`
	East  float64 `json:"east"`
	North float64 `json:"north"`
	Start string  `json:"start"`
	End   string  `json:"end,omitempty"`
	Days  int     `json:"days"`
}

func (q Query) Validate() error {
	for _, x := range []float64{q.West, q.South, q.East, q.North} {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return fmt.Errorf("finite bounds required")
		}
	}
	width := q.East - q.West
	if width < 0 {
		width += 360
	}
	if q.West < -180 || q.West > 180 || q.East < -180 || q.East > 180 || q.South < -90 || q.North > 90 || q.South >= q.North || width <= 0 || width > 30 || q.North-q.South > 30 {
		return fmt.Errorf("choose a region at most 30 degrees wide and high")
	}
	if q.Days < 1 || q.Days > 5 {
		return fmt.Errorf("choose 1 to 5 UTC days")
	}
	d, e := time.Parse("2006-01-02", q.Start)
	if e != nil || d.After(time.Now().UTC()) {
		return fmt.Errorf("valid non-future UTC start date required")
	}
	if q.End != "" && q.End != d.AddDate(0, 0, q.Days-1).Format("2006-01-02") {
		return fmt.Errorf("end date must agree with start and number of UTC days")
	}
	return nil
}
func (q Query) Parts() []Query {
	if q.West <= q.East {
		return []Query{q}
	}
	a, b := q, q
	a.East = 180
	b.West = -180
	return []Query{a, b}
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
func ParseEONET(raw []byte) ([]Incident, error) {
	var v struct {
		Events []struct {
			ID          string
			Title       string
			Description *string
			Closed      *string
			Sources     []Source
			Categories  []struct{ ID string }
			Geometry    []Geometry
		}
	}
	if e := json.Unmarshal(raw, &v); e != nil || v.Events == nil {
		return nil, fmt.Errorf("invalid EONET event envelope")
	}
	if len(v.Events) > 1000 {
		return nil, fmt.Errorf("EONET response exceeds the 1000-record cap")
	}
	out := []Incident{}
	seen := map[string]bool{}
	for _, e := range v.Events {
		fire := false
		for _, c := range e.Categories {
			fire = fire || c.ID == "wildfires"
		}
		if !fire {
			continue
		}
		if e.ID == "" || e.Title == "" || len(e.Geometry) == 0 {
			return nil, fmt.Errorf("invalid EONET incident")
		}
		if seen[e.ID] {
			return nil, fmt.Errorf("duplicate EONET ID")
		}
		seen[e.ID] = true
		status := "open"
		if e.Closed != nil {
			status = "closed"
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
		out = append(out, Incident{"eonet:" + e.ID, e.ID, e.Title, e.Description, e.Closed, status, e.Sources, e.Geometry})
	}
	if len(v.Events) == 1000 {
		return out, errEONETCap
	}
	return out, nil
}
func ParseFIRMS(raw []byte) ([]Detection, error) {
	r := csv.NewReader(bytes.NewReader(raw))
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("missing FIRMS CSV header")
	}
	columns := map[string]int{}
	for i, h := range header {
		h = strings.TrimSpace(h)
		if _, ok := columns[h]; ok {
			return nil, fmt.Errorf("duplicate CSV header")
		}
		columns[h] = i
	}
	for _, k := range []string{"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "version", "bright_ti4", "bright_ti5", "frp", "scan", "track", "daynight"} {
		if _, ok := columns[k]; !ok {
			return nil, fmt.Errorf("missing FIRMS column %s", k)
		}
	}
	out := []Detection{}
	seen := map[string]int{}
	count := 0
	for {
		row, e := r.Read()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, fmt.Errorf("malformed FIRMS CSV")
		}
		count++
		if count > MaxRecords {
			return nil, fmt.Errorf("FIRMS record cap reached; incomplete")
		}
		get := func(k string) string { return strings.TrimSpace(row[columns[k]]) }
		num := func(k string) (*float64, error) {
			s := get(k)
			if s == "" {
				return nil, nil
			}
			v, e := strconv.ParseFloat(s, 64)
			if e != nil || math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, fmt.Errorf("invalid numeric field %s", k)
			}
			return &v, nil
		}
		lon, e := num("longitude")
		if e != nil {
			return nil, e
		}
		lat, e := num("latitude")
		if e != nil || lon == nil || lat == nil || !validPoint([]float64{*lon, *lat}) {
			return nil, fmt.Errorf("invalid detection coordinates")
		}
		clock := get("acq_time")
		if len(clock) < 4 {
			clock = strings.Repeat("0", 4-len(clock)) + clock
		}
		t, e := time.Parse("2006-01-02 1504", get("acq_date")+" "+clock)
		if e != nil {
			return nil, fmt.Errorf("invalid acquisition date/time")
		}
		if get("satellite") != "N20" && get("satellite") != "NOAA-20" {
			return nil, fmt.Errorf("unexpected satellite for NOAA-20 product")
		}
		conf := get("confidence")
		switch conf {
		case "l":
			conf = "low"
		case "n":
			conf = "nominal"
		case "h":
			conf = "high"
		}
		if conf != "low" && conf != "nominal" && conf != "high" {
			return nil, fmt.Errorf("unknown VIIRS confidence")
		}
		if get("version") == "" || (get("daynight") != "D" && get("daynight") != "N") {
			return nil, fmt.Errorf("invalid product metadata")
		}
		d := Detection{Acquisition: t.UTC().Format(time.RFC3339), Precision: "minute", Longitude: *lon, Latitude: *lat, Satellite: "NOAA-20", Instrument: "VIIRS", Product: Product, Version: get("version"), Confidence: conf, DayNight: get("daynight")}
		for k, dest := range map[string]**float64{"bright_ti4": &d.BrightI4, "bright_ti5": &d.BrightI5, "frp": &d.FRP, "scan": &d.Scan, "track": &d.Track} {
			v, e := num(k)
			if e != nil {
				return nil, e
			}
			if v != nil && *v < 0 {
				return nil, fmt.Errorf("negative measurement %s", k)
			}
			*dest = v
		}
		identity := fmt.Sprintf("%s|%s|%s|%.8f|%.8f|%s", Product, d.Satellite, d.Acquisition, d.Longitude, d.Latitude, d.Version)
		d.ID = "firms:" + hash([]byte(identity))
		if at, ok := seen[d.ID]; ok {
			out[at] = d
		} else {
			seen[d.ID] = len(out)
			out = append(out, d)
		}
	}
	return out, nil
}

// ParseCWFISHotspots reads the public Canadian Wildland Fire Information
// System Fire M3 daily hotspot CSV. These are satellite observations with
// Canada-specific fire-weather attributes, not agency incident records.
func ParseCWFISHotspots(raw []byte) ([]Detection, error) {
	r := csv.NewReader(bytes.NewReader(raw))
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("missing CWFIS CSV header")
	}
	columns := map[string]int{}
	for i, h := range header {
		name := strings.TrimSpace(h)
		if _, exists := columns[name]; exists {
			return nil, fmt.Errorf("duplicate CWFIS column")
		}
		columns[name] = i
	}
	for _, k := range []string{"lat", "lon", "rep_date", "source", "sensor", "fwi", "estarea"} {
		if _, ok := columns[k]; !ok {
			return nil, fmt.Errorf("missing CWFIS column %s", k)
		}
	}
	get := func(row []string, k string) string {
		if i, ok := columns[k]; ok {
			return strings.TrimSpace(row[i])
		}
		return ""
	}
	out := []Detection{}
	seen := map[string]int{}
	for n := 0; ; n++ {
		row, e := r.Read()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, fmt.Errorf("malformed CWFIS CSV")
		}
		if n >= MaxRecords {
			return nil, fmt.Errorf("CWFIS record cap reached; incomplete")
		}
		lat, e1 := strconv.ParseFloat(get(row, "lat"), 64)
		lon, e2 := strconv.ParseFloat(get(row, "lon"), 64)
		if e1 != nil || e2 != nil || !validPoint([]float64{lon, lat}) {
			return nil, fmt.Errorf("invalid CWFIS coordinates")
		}
		t, e := time.Parse("2006-01-02 15:04:05", get(row, "rep_date"))
		if e != nil {
			return nil, fmt.Errorf("invalid CWFIS report time")
		}
		identity := fmt.Sprintf("CWFIS_FIREM3|%s|%s|%s|%.8f|%.8f", get(row, "sensor"), get(row, "source"), t.UTC().Format(time.RFC3339), lon, lat)
		d := Detection{ID: "cwfis:" + hash([]byte(identity)), Acquisition: t.UTC().Format(time.RFC3339), Precision: "second", Longitude: lon, Latitude: lat, Satellite: get(row, "satellite"), SourceCode: get(row, "source"), Agency: get(row, "agency"), Fuel: get(row, "fuel"), Instrument: get(row, "sensor"), Product: "CWFIS_FIREM3_HOTSPOTS", Version: "daily", Confidence: "unknown", DayNight: "unknown"}
		for k, dest := range map[string]**float64{"fwi": &d.FWI, "ros": &d.ROS, "hfi": &d.HFI, "sfc": &d.SFC, "tfc": &d.TFC} {
			value := get(row, k)
			if value == "" {
				continue
			}
			v, err := strconv.ParseFloat(value, 64)
			if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, fmt.Errorf("invalid CWFIS measurement %s", k)
			}
			// Negative provider sentinel values are unavailable, not measurements.
			if v >= 0 {
				*dest = &v
			}
		}
		if at, ok := seen[d.ID]; ok {
			out[at] = d
		} else {
			seen[d.ID] = len(out)
			out = append(out, d)
		}
	}
	return out, nil
}
