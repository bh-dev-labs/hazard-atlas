package observatory

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	_ "modernc.org/sqlite"
	"time"
)

type Dataset struct {
	ID       string          `json:"id"`
	Query    string          `json:"query"`
	Fetched  string          `json:"fetched"`
	Complete bool            `json:"complete"`
	Stale    bool            `json:"stale"`
	Error    string          `json:"error,omitempty"`
	Data     json.RawMessage `json:"data"`
}
type Store struct{ DB *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
 INSERT OR IGNORE INTO schema_version VALUES(1);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, updated INTEGER NOT NULL, payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, query TEXT NOT NULL, fetched TEXT NOT NULL, payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS members(dataset TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(dataset,event));
 CREATE INDEX IF NOT EXISTS datasets_query ON datasets(query,fetched);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}

// datasetID is the content address of a dataset: sha256 over the query, a
// newline and the raw payload. Hashing in two writes avoids copying the
// (up to 32 MiB) payload just to prepend the query.
func datasetID(query string, raw []byte) string {
	h := sha256.New()
	io.WriteString(h, query)
	io.WriteString(h, "\n")
	h.Write(raw)
	return hex.EncodeToString(h.Sum(nil))
}
func (s *Store) Save(query string, raw []byte) (Dataset, error) {
	c, err := Parse(raw)
	if err != nil {
		return Dataset{}, err
	}
	id := datasetID(query, raw)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.DB.Begin()
	if err != nil {
		return Dataset{}, err
	}
	defer tx.Rollback()
	// A 20,000-event history would otherwise re-plan the same two statements
	// 40,000 times inside this transaction.
	events, err := tx.Prepare(`INSERT INTO events VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload WHERE excluded.updated>=events.updated`)
	if err != nil {
		return Dataset{}, err
	}
	defer events.Close()
	members, err := tx.Prepare(`INSERT OR IGNORE INTO members VALUES(?,?)`)
	if err != nil {
		return Dataset{}, err
	}
	defer members.Close()
	for _, e := range c.Features {
		b, _ := json.Marshal(e)
		if _, err = events.Exec(e.ID, e.Properties.Updated, b); err != nil {
			return Dataset{}, err
		}
	}
	if _, err = tx.Exec(`INSERT INTO datasets VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET fetched=excluded.fetched`, id, query, now, raw); err != nil {
		return Dataset{}, err
	}
	for _, e := range c.Features {
		if _, err = members.Exec(id, e.ID); err != nil {
			return Dataset{}, err
		}
	}
	// Keep the latest 40 cached datasets; exports are the durable user-owned snapshots.
	if _, err = tx.Exec(`DELETE FROM members WHERE dataset IN (SELECT id FROM datasets ORDER BY fetched DESC LIMIT -1 OFFSET 40); DELETE FROM datasets WHERE id NOT IN (SELECT id FROM datasets ORDER BY fetched DESC LIMIT 40); DELETE FROM events WHERE id NOT IN (SELECT event FROM members)`); err != nil {
		return Dataset{}, err
	}
	if err = tx.Commit(); err != nil {
		return Dataset{}, err
	}
	return Dataset{id, query, now, true, false, "", raw}, nil
}

// Touch restarts the freshness window of an existing dataset without
// re-parsing or re-inserting its members; use it when upstream reports the
// content unchanged (HTTP 304). It returns sql.ErrNoRows if id is unknown.
func (s *Store) Touch(id string, fetched time.Time) error {
	res, err := s.DB.Exec(`UPDATE datasets SET fetched=? WHERE id=?`, fetched.UTC().Format(time.RFC3339Nano), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
func (s *Store) Latest(query string) (Dataset, error) {
	var d Dataset
	err := s.DB.QueryRow(`SELECT id,query,fetched,payload FROM datasets WHERE query=? ORDER BY fetched DESC LIMIT 1`, query).Scan(&d.ID, &d.Query, &d.Fetched, &d.Data)
	d.Complete = true
	return d, err
}
func (s *Store) Backup(path string) error { _, err := s.DB.Exec(`VACUUM INTO ?`, path); return err }

// Check runs a full integrity check; use it for the -check-db command.
func (s *Store) Check() error { return s.pragmaCheck("integrity_check") }

// QuickCheck skips index-content verification and is cheap enough for a
// readiness probe.
func (s *Store) QuickCheck() error { return s.pragmaCheck("quick_check") }

func (s *Store) pragmaCheck(name string) error {
	var result string
	if err := s.DB.QueryRow(`PRAGMA ` + name).Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("integrity: %s", result)
	}
	return nil
}
