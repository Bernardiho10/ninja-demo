// Package db is ninja-bank's own SQLite layer — separate database file
// from the other apps in apps/, since each is a standalone demo that
// happens to share one Go module.
package db

import (
	"database/sql"
	_ "embed"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

func Open(path string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := conn.Exec(schema); err != nil {
		conn.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return conn, nil
}

type Business struct {
	ID        string
	Name      string
	RCNumber  string
	Status    string
	CreatedAt string
}

func InsertBusiness(conn *sql.DB, id, name, rcNumber string) error {
	_, err := conn.Exec(`INSERT INTO businesses (id, name, rc_number) VALUES (?, ?, ?)`, id, name, rcNumber)
	return err
}

func GetBusiness(conn *sql.DB, id string) (*Business, error) {
	row := conn.QueryRow(`SELECT id, name, rc_number, status, created_at FROM businesses WHERE id = ?`, id)
	var b Business
	err := row.Scan(&b.ID, &b.Name, &b.RCNumber, &b.Status, &b.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func ListBusinesses(conn *sql.DB) ([]*Business, error) {
	rows, err := conn.Query(`SELECT id, name, rc_number, status, created_at FROM businesses ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Business
	for rows.Next() {
		var b Business
		if err := rows.Scan(&b.ID, &b.Name, &b.RCNumber, &b.Status, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &b)
	}
	return out, rows.Err()
}

func UpdateBusinessStatus(conn *sql.DB, id, status string) error {
	_, err := conn.Exec(`UPDATE businesses SET status = ? WHERE id = ?`, status, id)
	return err
}

type Director struct {
	ID                   string
	BusinessID           string
	FullName             string
	IDType               string
	IDNumber             string
	Found                bool
	RegistryFirstName    sql.NullString
	RegistryLastName     sql.NullString
	RegistryDateOfBirth  sql.NullString
	Status               string
	CheckedAt            string
}

// InsertDirector replaces any prior check for the same business+id_number —
// re-running a bulk-verify for a business should overwrite that director's
// last result, not pile up duplicate rows for the same person.
func InsertDirector(conn *sql.DB, id, businessID, fullName, idType, idNumber string, found bool, registryFirstName, registryLastName, registryDOB, status string) error {
	_, err := conn.Exec(`DELETE FROM business_directors WHERE business_id = ? AND id_number = ?`, businessID, idNumber)
	if err != nil {
		return err
	}
	foundInt := 0
	if found {
		foundInt = 1
	}
	_, err = conn.Exec(`
		INSERT INTO business_directors (id, business_id, full_name, id_type, id_number, found, registry_first_name, registry_last_name, registry_date_of_birth, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, businessID, fullName, idType, idNumber, foundInt, nullIfEmpty(registryFirstName), nullIfEmpty(registryLastName), nullIfEmpty(registryDOB), status)
	return err
}

func nullIfEmpty(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func ListDirectorsByBusiness(conn *sql.DB, businessID string) ([]*Director, error) {
	rows, err := conn.Query(`
		SELECT id, business_id, full_name, id_type, id_number, found, registry_first_name, registry_last_name, registry_date_of_birth, status, checked_at
		FROM business_directors WHERE business_id = ? ORDER BY checked_at DESC
	`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Director
	for rows.Next() {
		var d Director
		var foundInt int
		if err := rows.Scan(&d.ID, &d.BusinessID, &d.FullName, &d.IDType, &d.IDNumber, &foundInt, &d.RegistryFirstName, &d.RegistryLastName, &d.RegistryDateOfBirth, &d.Status, &d.CheckedAt); err != nil {
			return nil, err
		}
		d.Found = foundInt == 1
		out = append(out, &d)
	}
	return out, rows.Err()
}

type Agent struct {
	ID                  string
	BusinessID          string
	AgentCode           string
	FullName            string
	IDType              string
	IDNumber            string
	Score               float64
	Recommendation      string
	Status              string
	DuplicateOfAgentID  sql.NullString
	CreatedAt           string
}

// FindAgentByIDNumber looks for any EXISTING agent (across every business,
// not just one) already registered under this id_number — the whole point
// of the agent-network story is that identity theft doesn't respect
// business boundaries, one stolen NIN can be used to open terminals under
// several different businesses.
func FindAgentByIDNumber(conn *sql.DB, idNumber string) (*Agent, error) {
	row := conn.QueryRow(`
		SELECT id, business_id, agent_code, full_name, id_type, id_number, score, recommendation, status, duplicate_of_agent_id, created_at
		FROM agents WHERE id_number = ? AND status != 'flagged_duplicate_identity' ORDER BY created_at ASC LIMIT 1
	`, idNumber)
	var a Agent
	err := row.Scan(&a.ID, &a.BusinessID, &a.AgentCode, &a.FullName, &a.IDType, &a.IDNumber, &a.Score, &a.Recommendation, &a.Status, &a.DuplicateOfAgentID, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func InsertAgent(conn *sql.DB, id, businessID, agentCode, fullName, idType, idNumber string, score float64, recommendation, status, duplicateOfAgentID string) error {
	_, err := conn.Exec(`
		INSERT INTO agents (id, business_id, agent_code, full_name, id_type, id_number, score, recommendation, status, duplicate_of_agent_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, businessID, agentCode, fullName, idType, idNumber, score, recommendation, status, nullIfEmpty(duplicateOfAgentID))
	return err
}

func ListAgentsByBusiness(conn *sql.DB, businessID string) ([]*Agent, error) {
	rows, err := conn.Query(`
		SELECT id, business_id, agent_code, full_name, id_type, id_number, score, recommendation, status, duplicate_of_agent_id, created_at
		FROM agents WHERE business_id = ? ORDER BY created_at DESC
	`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Agent
	for rows.Next() {
		var a Agent
		if err := rows.Scan(&a.ID, &a.BusinessID, &a.AgentCode, &a.FullName, &a.IDType, &a.IDNumber, &a.Score, &a.Recommendation, &a.Status, &a.DuplicateOfAgentID, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

type APILog struct {
	ID              string
	Endpoint        string
	Method          string
	StatusCode      int
	DurationMs      int
	RequestPayload  sql.NullString
	ResponsePayload sql.NullString
	IsMock          bool
	CreatedAt       string
}

func InsertAPILog(conn *sql.DB, id, endpoint, method string, statusCode, durationMs int, reqPayload, respPayload string, isMock bool) error {
	mock := 0
	if isMock {
		mock = 1
	}
	_, err := conn.Exec(`
		INSERT INTO api_logs (id, endpoint, method, status_code, duration_ms, request_payload, response_payload, is_mock)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, endpoint, method, statusCode, durationMs, reqPayload, respPayload, mock)
	return err
}

func ListRecentAPILogs(conn *sql.DB, limit int) ([]*APILog, error) {
	if limit <= 0 {
		limit = 30
	}
	rows, err := conn.Query(`
		SELECT id, endpoint, method, status_code, duration_ms, request_payload, response_payload, is_mock, created_at
		FROM api_logs ORDER BY created_at DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*APILog
	for rows.Next() {
		var l APILog
		var mock int
		if err := rows.Scan(&l.ID, &l.Endpoint, &l.Method, &l.StatusCode, &l.DurationMs, &l.RequestPayload, &l.ResponsePayload, &mock, &l.CreatedAt); err != nil {
			return nil, err
		}
		l.IsMock = mock == 1
		out = append(out, &l)
	}
	return out, rows.Err()
}
