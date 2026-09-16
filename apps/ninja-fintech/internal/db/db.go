// Package db is ninja-fintech's own SQLite layer — separate database file
// from ninja-bet and the parent repo's data.db, since each app in apps/
// is a standalone demo that happens to share one Go module.
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

type FintechCustomer struct {
	ID           string
	FullName     string
	DateOfBirth  string
	IDType       string
	IDNumber     string
	Score        float64
	Recommendation string
	MismatchesRaw sql.NullString
	FieldsRaw    string
	Status       string
	Tier         int
	DailyLimitKobo int64
	BalanceKobo  int64
	LastCheckedAt string
	CreatedAt    string
}

const fintechCustomerColumns = `
	id, full_name, date_of_birth, id_type, id_number,
	score, recommendation, mismatches_raw, fields_raw, status,
	tier, daily_limit_kobo, balance_kobo, last_checked_at, created_at
`

func scanFintechCustomer(row interface{ Scan(dest ...any) error }) (*FintechCustomer, error) {
	var c FintechCustomer
	err := row.Scan(
		&c.ID, &c.FullName, &c.DateOfBirth, &c.IDType, &c.IDNumber,
		&c.Score, &c.Recommendation, &c.MismatchesRaw, &c.FieldsRaw, &c.Status,
		&c.Tier, &c.DailyLimitKobo, &c.BalanceKobo, &c.LastCheckedAt, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// InsertFintechCustomer records a freshly onboarded customer — tier and
// daily limit both start at their Tier 1 defaults (schema.sql) regardless
// of the verification outcome; UpgradeFintechCustomerTier is a separate,
// explicit ops action, not automatic, since a real compliance team makes
// that call deliberately rather than having software silently raise limits.
func InsertFintechCustomer(conn *sql.DB, id, fullName, dob, idType, idNumber string, score float64, recommendation, mismatchesJSON, fieldsJSON, status string) error {
	_, err := conn.Exec(`
		INSERT INTO fintech_customers (id, full_name, date_of_birth, id_type, id_number, score, recommendation, mismatches_raw, fields_raw, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, fullName, dob, idType, idNumber, score, recommendation, mismatchesJSON, fieldsJSON, status)
	return err
}

func GetFintechCustomer(conn *sql.DB, id string) (*FintechCustomer, error) {
	row := conn.QueryRow(`SELECT `+fintechCustomerColumns+` FROM fintech_customers WHERE id = ?`, id)
	c, err := scanFintechCustomer(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return c, err
}

func ListFintechCustomers(conn *sql.DB) ([]*FintechCustomer, error) {
	rows, err := conn.Query(`SELECT ` + fintechCustomerColumns + ` FROM fintech_customers ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*FintechCustomer
	for rows.Next() {
		c, err := scanFintechCustomer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpdateFintechCustomerRecheck records a re-KYC result — same shape as
// onboarding, but overwrites score/recommendation/status rather than
// inserting a new row, since this is the SAME customer re-checked, not
// a new one.
func UpdateFintechCustomerRecheck(conn *sql.DB, id string, score float64, recommendation, mismatchesJSON, fieldsJSON, status string) error {
	_, err := conn.Exec(`
		UPDATE fintech_customers SET
			score = ?, recommendation = ?, mismatches_raw = ?, fields_raw = ?, status = ?,
			last_checked_at = datetime('now')
		WHERE id = ?
	`, score, recommendation, mismatchesJSON, fieldsJSON, status, id)
	return err
}

func UpdateFintechCustomerTier(conn *sql.DB, id string, tier int, dailyLimitKobo int64) error {
	_, err := conn.Exec(`UPDATE fintech_customers SET tier = ?, daily_limit_kobo = ? WHERE id = ?`, tier, dailyLimitKobo, id)
	return err
}

type FintechTransfer struct {
	ID               string
	CustomerID       string
	RecipientName    string
	RecipientBank    string
	RecipientAccount string
	AmountKobo       int64
	Status           string
	Reason           string
	CreatedAt        string
}

func InsertFintechTransfer(conn *sql.DB, id, customerID, recipientName, recipientBank, recipientAccount string, amountKobo int64, status, reason string) error {
	_, err := conn.Exec(`
		INSERT INTO fintech_transfers (id, customer_id, recipient_name, recipient_bank, recipient_account, amount_kobo, status, reason)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, customerID, recipientName, recipientBank, recipientAccount, amountKobo, status, reason)
	return err
}

func ListFintechTransfersByCustomer(conn *sql.DB, customerID string) ([]*FintechTransfer, error) {
	rows, err := conn.Query(`
		SELECT id, customer_id, recipient_name, recipient_bank, recipient_account, amount_kobo, status, reason, created_at
		FROM fintech_transfers WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20
	`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*FintechTransfer
	for rows.Next() {
		var t FintechTransfer
		if err := rows.Scan(&t.ID, &t.CustomerID, &t.RecipientName, &t.RecipientBank, &t.RecipientAccount, &t.AmountKobo, &t.Status, &t.Reason, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &t)
	}
	return out, rows.Err()
}

type APILog struct {
	ID               string
	Endpoint         string
	Method           string
	StatusCode       int
	DurationMs       int
	RequestPayload   sql.NullString
	ResponsePayload  sql.NullString
	IsMock           bool
	CreatedAt        string
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
