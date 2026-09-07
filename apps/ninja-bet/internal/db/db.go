// Package db is ninja-bet's own SQLite layer — separate database file from
// the parent ninja-demo repo's data.db, since this is a standalone demo app
// that happens to live in the same Go module.
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

type Player struct {
	ID           string
	FirstName    string
	LastName     string
	PhoneNumber  string
	PasswordHash string

	KYCStatus    string
	IDType       string
	IDNumber     string
	DateOfBirth  sql.NullString
	Age          sql.NullInt64
	MatchScore   sql.NullFloat64
	LookupRaw    sql.NullString
	VerifyRaw    sql.NullString
	PhotoDataURI sql.NullString

	SelfExcluded bool

	BalanceKobo  int64
	WinningsKobo int64

	SavedBankName      sql.NullString
	SavedAccountNumber sql.NullString

	FaceVerificationID     sql.NullString
	FaceVerificationURL    sql.NullString
	FaceVerificationStatus sql.NullString
	FaceScore              sql.NullFloat64
	FaceVerifyRaw          sql.NullString

	RequireFaceForPayout bool
	LivenessThreshold    float64

	CreatedAt string
	UpdatedAt string
}

func (p *Player) FullName() string { return p.FirstName + " " + p.LastName }

// CanTransact reports whether the player's identity was resolved cleanly
// enough to bet or withdraw real money — true for a first-time verified
// identity AND for a detected duplicate (that person is real, they just
// don't get a second welcome bonus), false for underage or name-mismatch
// accounts, which have no reliable identity to transact against.
func (p *Player) CanTransact() bool {
	return p.KYCStatus == "verified" || p.KYCStatus == "flagged_duplicate_identity"
}

const playerColumns = `
	id, first_name, last_name, phone_number, password_hash,
	kyc_status, id_type, id_number, date_of_birth, age, match_score, lookup_raw, verify_raw, photo_data_uri,
	self_excluded, balance_kobo, winnings_kobo, saved_bank_name, saved_account_number,
	face_verification_id, face_verification_url, face_verification_status, face_score, face_verify_raw,
	require_face_for_payout, liveness_threshold,
	created_at, updated_at
`

func scanPlayer(row interface{ Scan(dest ...any) error }) (*Player, error) {
	var p Player
	var selfExcluded, requireFaceForPayout int
	err := row.Scan(
		&p.ID, &p.FirstName, &p.LastName, &p.PhoneNumber, &p.PasswordHash,
		&p.KYCStatus, &p.IDType, &p.IDNumber, &p.DateOfBirth, &p.Age, &p.MatchScore, &p.LookupRaw, &p.VerifyRaw, &p.PhotoDataURI,
		&selfExcluded, &p.BalanceKobo, &p.WinningsKobo, &p.SavedBankName, &p.SavedAccountNumber,
		&p.FaceVerificationID, &p.FaceVerificationURL, &p.FaceVerificationStatus, &p.FaceScore, &p.FaceVerifyRaw,
		&requireFaceForPayout, &p.LivenessThreshold,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	p.SelfExcluded = selfExcluded == 1
	p.RequireFaceForPayout = requireFaceForPayout == 1
	return &p, nil
}

// CreatePlayer inserts a player whose identity has already been resolved via
// identity/identify (lookup then verify) — there is no "unverified" account
// state in this design, registration itself is the KYC gate. balanceKobo is
// explicit (not the schema default) because a detected duplicate identity
// gets zero welcome credit instead of the usual ₦100,000.
func CreatePlayer(conn *sql.DB, id, firstName, lastName, phoneNumber, passwordHash, kycStatus, idNumber, dob string, age int, score float64, lookupRawJSON, verifyRawJSON, photoDataURI string, balanceKobo int64) error {
	_, err := conn.Exec(`
		INSERT INTO players (
			id, first_name, last_name, phone_number, password_hash,
			kyc_status, id_type, id_number, date_of_birth, age, match_score, lookup_raw, verify_raw, photo_data_uri,
			balance_kobo
		) VALUES (?, ?, ?, ?, ?, ?, 'nin', ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, firstName, lastName, phoneNumber, passwordHash, kycStatus, idNumber, dob, age, score, lookupRawJSON, verifyRawJSON, photoDataURI, balanceKobo)
	return err
}

// CountPlayersByIdentity powers the bonus-farming defense: how many accounts
// already exist for this exact NIN. Ninja resolves an identity; whether that
// identity is allowed a second welcome bonus is this app's business rule.
func CountPlayersByIdentity(conn *sql.DB, idNumber string) (int, error) {
	var n int
	err := conn.QueryRow(`SELECT COUNT(*) FROM players WHERE id_number = ?`, idNumber).Scan(&n)
	return n, err
}

// ListPlayersByIdentity returns every account tied to one NIN — the "one
// identity behind N accounts" fraud view.
func ListPlayersByIdentity(conn *sql.DB, idNumber string) ([]*Player, error) {
	rows, err := conn.Query(`SELECT `+playerColumns+` FROM players WHERE id_number = ? ORDER BY created_at ASC`, idNumber)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Player
	for rows.Next() {
		p, err := scanPlayer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListDuplicateIdentityGroups returns, for every NIN tied to more than one
// account, the NIN and how many accounts share it — the admin "fraud
// signals" view.
type DuplicateIdentityGroup struct {
	IDNumber     string
	AccountCount int
}

// ImpactSummary powers the "here's what Ninja actually stopped" strip —
// every number is a real COUNT/SUM over this app's own data, not a made-up
// marketing figure.
type ImpactSummary struct {
	DuplicateAccountsBlocked int
	BonusFraudPreventedKobo  int64
	ImpersonationAttempts    int
	PayoutFraudAttempts      int
	PayoutFraudPreventedKobo int64
}

func GetImpactSummary(conn *sql.DB) (*ImpactSummary, error) {
	var s ImpactSummary
	if err := conn.QueryRow(`SELECT COUNT(*) FROM players WHERE kyc_status = 'flagged_duplicate_identity'`).Scan(&s.DuplicateAccountsBlocked); err != nil {
		return nil, err
	}
	s.BonusFraudPreventedKobo = int64(s.DuplicateAccountsBlocked) * 10000000
	if err := conn.QueryRow(`SELECT COUNT(*) FROM players WHERE kyc_status = 'blocked_mismatch'`).Scan(&s.ImpersonationAttempts); err != nil {
		return nil, err
	}
	if err := conn.QueryRow(`SELECT COUNT(*) FROM payouts WHERE status = 'blocked_beneficiary_mismatch'`).Scan(&s.PayoutFraudAttempts); err != nil {
		return nil, err
	}
	var sum sql.NullInt64
	if err := conn.QueryRow(`SELECT SUM(amount_kobo) FROM payouts WHERE status = 'blocked_beneficiary_mismatch'`).Scan(&sum); err != nil {
		return nil, err
	}
	s.PayoutFraudPreventedKobo = sum.Int64
	return &s, nil
}

func ListDuplicateIdentityGroups(conn *sql.DB) ([]DuplicateIdentityGroup, error) {
	rows, err := conn.Query(`
		SELECT id_number, COUNT(*) as n FROM players
		GROUP BY id_number HAVING COUNT(*) > 1 ORDER BY n DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DuplicateIdentityGroup
	for rows.Next() {
		var g DuplicateIdentityGroup
		if err := rows.Scan(&g.IDNumber, &g.AccountCount); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func GetPlayer(conn *sql.DB, id string) (*Player, error) {
	row := conn.QueryRow(`SELECT `+playerColumns+` FROM players WHERE id = ?`, id)
	return scanPlayer(row)
}

func GetPlayerByPhone(conn *sql.DB, phoneNumber string) (*Player, error) {
	row := conn.QueryRow(`SELECT `+playerColumns+` FROM players WHERE phone_number = ?`, phoneNumber)
	p, err := scanPlayer(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return p, err
}

// GetPlayerByFaceVerificationID looks up whichever player owns a hosted-KYC
// verification — used to dispatch the "verification.completed" webhook.
func GetPlayerByFaceVerificationID(conn *sql.DB, verificationID string) (*Player, error) {
	row := conn.QueryRow(`SELECT `+playerColumns+` FROM players WHERE face_verification_id = ?`, verificationID)
	p, err := scanPlayer(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return p, err
}

// UpdatePlayerBankDetails saves a payout destination so the withdrawal form
// can pre-fill it — still editable per-request.
func UpdatePlayerBankDetails(conn *sql.DB, id, bankName, accountNumber string) error {
	_, err := conn.Exec(`
		UPDATE players SET saved_bank_name = ?, saved_account_number = ?, updated_at = datetime('now') WHERE id = ?
	`, bankName, accountNumber, id)
	return err
}

// UpdatePlayerSecuritySettings sets the layer-2 payout gate: whether every
// withdrawal must re-check the player's most recent liveness score, and
// against what threshold.
func UpdatePlayerSecuritySettings(conn *sql.DB, id string, requireFaceForPayout bool, livenessThreshold float64) error {
	require := 0
	if requireFaceForPayout {
		require = 1
	}
	_, err := conn.Exec(`
		UPDATE players SET require_face_for_payout = ?, liveness_threshold = ?, updated_at = datetime('now') WHERE id = ?
	`, require, livenessThreshold, id)
	return err
}

// UpdatePlayerFaceVerificationStarted records a freshly created hosted-KYC
// link, before Ninja has told us the outcome.
func UpdatePlayerFaceVerificationStarted(conn *sql.DB, id, verificationID, verificationURL string) error {
	_, err := conn.Exec(`
		UPDATE players SET
			face_verification_id = ?, face_verification_url = ?, face_verification_status = 'pending',
			updated_at = datetime('now')
		WHERE id = ?
	`, verificationID, verificationURL, id)
	return err
}

// UpdatePlayerFaceVerificationOutcome records what the webhook told us once
// a real human has completed (or failed) the hosted selfie/liveness flow.
func UpdatePlayerFaceVerificationOutcome(conn *sql.DB, verificationID, status string, score float64, rawJSON string) error {
	_, err := conn.Exec(`
		UPDATE players SET
			face_verification_status = ?, face_score = ?, face_verify_raw = ?, updated_at = datetime('now')
		WHERE face_verification_id = ?
	`, status, score, rawJSON, verificationID)
	return err
}

func UpdatePlayerBalance(conn *sql.DB, id string, balanceKobo, winningsKobo int64) error {
	_, err := conn.Exec(`
		UPDATE players SET balance_kobo = ?, winnings_kobo = ?, updated_at = datetime('now') WHERE id = ?
	`, balanceKobo, winningsKobo, id)
	return err
}

func SetPlayerSelfExcluded(conn *sql.DB, id string) error {
	_, err := conn.Exec(`UPDATE players SET self_excluded = 1, updated_at = datetime('now') WHERE id = ?`, id)
	return err
}

// ResetPlayer restores demo balances only — identity is resolved once, at
// registration, and (unlike balance) isn't something a "reset" button should
// be able to undo; that would misrepresent KYC as a per-session toggle.
func ResetPlayer(conn *sql.DB, id string) error {
	_, err := conn.Exec(`
		UPDATE players SET
			balance_kobo = 10000000, winnings_kobo = 0, self_excluded = 0,
			updated_at = datetime('now')
		WHERE id = ?
	`, id)
	return err
}

type Bet struct {
	ID         string
	PlayerID   string
	MatchEvent string
	Selection  string
	Odds       float64
	StakeKobo  int64
	Status     string
	CreatedAt  string
}

func InsertBet(conn *sql.DB, id, playerID, matchEvent, selection string, odds float64, stakeKobo int64, status string) error {
	_, err := conn.Exec(`
		INSERT INTO bets (id, player_id, match_event, selection, odds, stake_kobo, status)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, id, playerID, matchEvent, selection, odds, stakeKobo, status)
	return err
}

func ListBetsByPlayer(conn *sql.DB, playerID string) ([]*Bet, error) {
	rows, err := conn.Query(`
		SELECT id, player_id, match_event, selection, odds, stake_kobo, status, created_at
		FROM bets WHERE player_id = ? ORDER BY created_at DESC LIMIT 20
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Bet
	for rows.Next() {
		var b Bet
		if err := rows.Scan(&b.ID, &b.PlayerID, &b.MatchEvent, &b.Selection, &b.Odds, &b.StakeKobo, &b.Status, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &b)
	}
	return out, rows.Err()
}

type Payout struct {
	ID              string
	PlayerID        string
	AmountKobo      int64
	BeneficiaryName sql.NullString
	BankName        sql.NullString
	AccountNumber   sql.NullString
	Status          string
	Reason          sql.NullString
	VerifyRaw       sql.NullString
	CreatedAt       string
}

func InsertPayout(conn *sql.DB, id, playerID string, amountKobo int64, beneficiaryName, bankName, accountNumber, status, reason, verifyRawJSON string) error {
	_, err := conn.Exec(`
		INSERT INTO payouts (id, player_id, amount_kobo, beneficiary_name, bank_name, account_number, status, reason, verify_raw)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, playerID, amountKobo, beneficiaryName, bankName, accountNumber, status, reason, verifyRawJSON)
	return err
}

func ListPayoutsByPlayer(conn *sql.DB, playerID string) ([]*Payout, error) {
	rows, err := conn.Query(`
		SELECT id, player_id, amount_kobo, beneficiary_name, bank_name, account_number, status, reason, verify_raw, created_at
		FROM payouts WHERE player_id = ? ORDER BY created_at DESC LIMIT 20
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Payout
	for rows.Next() {
		var p Payout
		if err := rows.Scan(&p.ID, &p.PlayerID, &p.AmountKobo, &p.BeneficiaryName, &p.BankName, &p.AccountNumber, &p.Status, &p.Reason, &p.VerifyRaw, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &p)
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
	mockVal := 0
	if isMock {
		mockVal = 1
	}
	_, err := conn.Exec(`
		INSERT INTO api_logs (id, endpoint, method, status_code, duration_ms, request_payload, response_payload, is_mock)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, endpoint, method, statusCode, durationMs, reqPayload, respPayload, mockVal)
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
		var isMockInt int
		if err := rows.Scan(&l.ID, &l.Endpoint, &l.Method, &l.StatusCode, &l.DurationMs, &l.RequestPayload, &l.ResponsePayload, &isMockInt, &l.CreatedAt); err != nil {
			return nil, err
		}
		l.IsMock = isMockInt == 1
		out = append(out, &l)
	}
	return out, rows.Err()
}

// GetConfig/SetConfig cache idempotent hosted-flow IDs — same pattern as
// the parent repo's internal/db.Config, so the flow only gets created once.
func GetConfig(conn *sql.DB, key string) (string, error) {
	var value string
	err := conn.QueryRow(`SELECT value FROM config WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func SetConfig(conn *sql.DB, key, value string) error {
	_, err := conn.Exec(`
		INSERT INTO config (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`, key, value)
	return err
}

type Deposit struct {
	ID         string
	PlayerID   string
	AmountKobo int64
	Method     string
	CreatedAt  string
}

func InsertDeposit(conn *sql.DB, id, playerID string, amountKobo int64, method string) error {
	_, err := conn.Exec(`
		INSERT INTO deposits (id, player_id, amount_kobo, method) VALUES (?, ?, ?, ?)
	`, id, playerID, amountKobo, method)
	return err
}

func ListDepositsByPlayer(conn *sql.DB, playerID string) ([]*Deposit, error) {
	rows, err := conn.Query(`
		SELECT id, player_id, amount_kobo, method, created_at
		FROM deposits WHERE player_id = ? ORDER BY created_at DESC LIMIT 20
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Deposit
	for rows.Next() {
		var d Deposit
		if err := rows.Scan(&d.ID, &d.PlayerID, &d.AmountKobo, &d.Method, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &d)
	}
	return out, rows.Err()
}

type WebhookEvent struct {
	ID          string
	Event       string
	DeliveryID  sql.NullString
	PayloadRaw  string
	SignatureOK bool
	Processed   bool
	Error       sql.NullString
	ReceivedAt  string
}

func InsertWebhookEvent(conn *sql.DB, id, event, deliveryID, payloadRaw string, signatureOK bool) error {
	_, err := conn.Exec(`
		INSERT INTO webhook_events (id, event, delivery_id, payload_raw, signature_ok)
		VALUES (?, ?, ?, ?, ?)
	`, id, event, deliveryID, payloadRaw, signatureOK)
	return err
}

func MarkWebhookEventProcessed(conn *sql.DB, id string, processErr error) error {
	var errMsg sql.NullString
	if processErr != nil {
		errMsg = sql.NullString{String: processErr.Error(), Valid: true}
	}
	_, err := conn.Exec(`UPDATE webhook_events SET processed = 1, error = ? WHERE id = ?`, errMsg, id)
	return err
}

func ListWebhookEvents(conn *sql.DB, limit int) ([]*WebhookEvent, error) {
	rows, err := conn.Query(`
		SELECT id, event, delivery_id, payload_raw, signature_ok, processed, error, received_at
		FROM webhook_events ORDER BY received_at DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*WebhookEvent
	for rows.Next() {
		var we WebhookEvent
		if err := rows.Scan(&we.ID, &we.Event, &we.DeliveryID, &we.PayloadRaw, &we.SignatureOK, &we.Processed, &we.Error, &we.ReceivedAt); err != nil {
			return nil, err
		}
		out = append(out, &we)
	}
	return out, rows.Err()
}
