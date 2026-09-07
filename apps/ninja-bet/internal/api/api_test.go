package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

func setupTestEnv(t *testing.T) *Env {
	conn, err := betdb.Open(":memory:")
	if err != nil {
		t.Fatalf("open memory db: %v", err)
	}
	client := ninja.NewClient("https://api.sandbox.ninja.boucloud.io", "key", "secret")
	client.SetMockMode(true)
	return &Env{DB: conn, Ninja: client, PublicURL: "http://localhost:5173"}
}

func register(t *testing.T, e *Env, phone, firstName, lastName, nin string) (*httptest.ResponseRecorder, *betdb.Player) {
	t.Helper()
	body, _ := json.Marshal(registerRequest{
		FirstName: firstName, LastName: lastName, PhoneNumber: phone, NIN: nin, Password: "password123",
	})
	req := httptest.NewRequest("POST", "/api/players/register", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	e.Register(rec, req)
	player, _ := betdb.GetPlayerByPhone(e.DB, phone)
	return rec, player
}

// TestRegisterVerifiedAdult exercises the full lookup-then-verify chain
// against the mock sandbox's clean-match fixture (James Bond, 77777777777).
func TestRegisterVerifiedAdult(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	rec, player := register(t, e, "08011111111", "James", "Bond", "77777777777")
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if player == nil {
		t.Fatal("expected player to be created")
	}
	if player.KYCStatus != "verified" {
		t.Errorf("expected verified, got %s", player.KYCStatus)
	}
	if !player.DateOfBirth.Valid || player.DateOfBirth.String != "1975-01-01" {
		t.Errorf("expected DOB from lookup response (1975-01-01), got %+v", player.DateOfBirth)
	}
	if player.BalanceKobo != 10000000 {
		t.Errorf("expected welcome credit, got %d", player.BalanceKobo)
	}
}

// TestRegisterUnderage exercises the age gate using the mock's Tobi Minor
// fixture (DOB 2010-06-15, well under 18).
func TestRegisterUnderage(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, player := register(t, e, "08022222222", "Tobi", "Minor", "88888888888")
	if player == nil {
		t.Fatal("expected player to be created even when underage — account exists but is locked")
	}
	if player.KYCStatus != "blocked_underage" {
		t.Errorf("expected blocked_underage, got %s", player.KYCStatus)
	}
}

// TestRegisterNINNotFound is a regression test: registration must reject
// outright (no account created) when the NIN doesn't resolve to any
// registry record at all — a different failure mode than a name mismatch.
func TestRegisterNINNotFound(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	rec, player := register(t, e, "08033333333", "Nobody", "Real", "55555555555")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for a NIN with no registry record, got %d: %s", rec.Code, rec.Body.String())
	}
	if player != nil {
		t.Fatalf("expected no account to be created when the lookup finds nothing")
	}
}

// TestRegisterDuplicatePhone confirms a second registration with the same
// phone number is rejected rather than silently logging the caller in.
func TestRegisterDuplicatePhone(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	register(t, e, "08044444444", "James", "Bond", "77777777777")
	rec, _ := register(t, e, "08044444444", "James", "Bond", "77777777777")
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 on duplicate phone number, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestPayoutGateOrdering is a regression test for a bug found and fixed
// during the hardening pass: a self-excluded player with insufficient
// winnings must be blocked FOR self-exclusion, not told "insufficient
// winnings balance" — the compliance gate must run first regardless of
// balance. See tutor.md.
func TestPayoutGateOrdering(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, player := register(t, e, "08055555555", "James", "Bond", "77777777777")
	if player.KYCStatus != "verified" {
		t.Fatalf("expected verified player, got status %s", player.KYCStatus)
	}
	if player.WinningsKobo != 0 {
		t.Fatalf("expected zero winnings for a fresh player, got %d", player.WinningsKobo)
	}

	selfExReq := httptest.NewRequest("POST", "/api/players/me/self-exclude", nil)
	selfExReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	selfExRec := httptest.NewRecorder()
	e.SelfExclude(selfExRec, selfExReq)
	if selfExRec.Code != 200 {
		t.Fatalf("self-exclude: expected 200, got %d", selfExRec.Code)
	}

	body, _ := json.Marshal(requestPayoutRequest{
		AmountNaira: 1000, BeneficiaryName: "James Bond", BankName: "GTBank", AccountNumber: "0123456789", BVN: "77777777777",
	})
	req := httptest.NewRequest("POST", "/api/payouts/request", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	rec := httptest.NewRecorder()
	e.RequestPayout(rec, req)

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "blocked_self_excluded" {
		t.Fatalf("expected status blocked_self_excluded (self-exclusion must be checked before balance), got %v — full response: %s", resp["status"], rec.Body.String())
	}
}

// TestBonusFarmingDetection is the core new feature: registering a second
// account against a NIN that's already on file must not pay a second
// welcome bonus, even though the identity itself is genuine.
func TestBonusFarmingDetection(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, first := register(t, e, "08011112222", "James", "Bond", "77777777777")
	if first.KYCStatus != "verified" || first.BalanceKobo != 10000000 {
		t.Fatalf("expected first account verified with ₦100,000 bonus, got status=%s balance=%d", first.KYCStatus, first.BalanceKobo)
	}

	_, second := register(t, e, "08033334444", "James", "Bond", "77777777777")
	if second.KYCStatus != "flagged_duplicate_identity" {
		t.Fatalf("expected second account flagged_duplicate_identity, got %s", second.KYCStatus)
	}
	if second.BalanceKobo != 0 {
		t.Fatalf("expected zero welcome bonus on a detected duplicate identity, got %d", second.BalanceKobo)
	}
	if !second.CanTransact() {
		t.Fatalf("a duplicate-but-genuine identity should still be able to bet/withdraw its own money")
	}

	groups, err := betdb.ListDuplicateIdentityGroups(e.DB)
	if err != nil {
		t.Fatalf("list duplicate groups: %v", err)
	}
	if len(groups) != 1 || groups[0].AccountCount != 2 {
		t.Fatalf("expected one duplicate group of 2 accounts, got %+v", groups)
	}
}

// TestPayoutBeneficiaryMismatch is the withdrawal-fraud defense: a payout
// naming a beneficiary whose name doesn't match the verified NIN holder
// must be blocked, even from a fully verified account.
func TestPayoutBeneficiaryMismatch(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, player := register(t, e, "08099998888", "James", "Bond", "77777777777")
	if !player.CanTransact() {
		t.Fatalf("expected a transactable account, got status %s", player.KYCStatus)
	}

	winReq := httptest.NewRequest("POST", "/api/bets/simulate-win", nil)
	winReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	e.SimulateWin(httptest.NewRecorder(), winReq)

	// The layer-2 liveness gate is on by default and runs before the
	// beneficiary-name check this test is isolating — clear it first so a
	// mismatched beneficiary name is the only thing left to trip.
	faceBody, _ := json.Marshal(map[string]string{"outcome": "passed"})
	faceReq := httptest.NewRequest("POST", "/api/players/me/simulate-face-verification", bytes.NewReader(faceBody))
	faceReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	e.SimulateFaceVerificationOutcome(httptest.NewRecorder(), faceReq)

	body, _ := json.Marshal(requestPayoutRequest{
		AmountNaira: 1000, BeneficiaryName: "Totally Different Person", BankName: "GTBank", AccountNumber: "0123456789", BVN: "77777777777",
	})
	req := httptest.NewRequest("POST", "/api/payouts/request", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	rec := httptest.NewRecorder()
	e.RequestPayout(rec, req)

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "blocked_beneficiary_mismatch" {
		t.Fatalf("expected blocked_beneficiary_mismatch for a mismatched beneficiary name, got %v — %s", resp["status"], rec.Body.String())
	}
}

// TestPayoutBVNMismatch is the second, independent beneficiary check: the
// typed name can match the NIN perfectly while the bank account's own BVN
// belongs to someone else — a name is easy to type correctly, a BVN isn't.
// This must block even though the NIN check alone would have approved it.
func TestPayoutBVNMismatch(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, player := register(t, e, "08099997777", "James", "Bond", "77777777777")
	if !player.CanTransact() {
		t.Fatalf("expected a transactable account, got status %s", player.KYCStatus)
	}

	winReq := httptest.NewRequest("POST", "/api/bets/simulate-win", nil)
	winReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	e.SimulateWin(httptest.NewRecorder(), winReq)

	faceBody, _ := json.Marshal(map[string]string{"outcome": "passed"})
	faceReq := httptest.NewRequest("POST", "/api/players/me/simulate-face-verification", bytes.NewReader(faceBody))
	faceReq.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	e.SimulateFaceVerificationOutcome(httptest.NewRecorder(), faceReq)

	// "James Bond" matches the NIN fine (see TestPayoutBeneficiaryMismatch's
	// sibling case) — but 77777777772 is the mock's Chukwuemeka Emeka
	// fixture, so the BVN check must be what blocks this, not the NIN one.
	body, _ := json.Marshal(requestPayoutRequest{
		AmountNaira: 1000, BeneficiaryName: "James Bond", BankName: "GTBank", AccountNumber: "0123456789", BVN: "77777777772",
	})
	req := httptest.NewRequest("POST", "/api/payouts/request", bytes.NewReader(body))
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: player.ID})
	rec := httptest.NewRecorder()
	e.RequestPayout(rec, req)

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "blocked_bvn_mismatch" {
		t.Fatalf("expected blocked_bvn_mismatch when the BVN resolves to a different person, got %v — %s", resp["status"], rec.Body.String())
	}
}

func TestValidationHelpers(t *testing.T) {
	cases := []struct {
		name string
		ok   bool
		fn   func() bool
	}{
		{"valid ng phone (0-prefix)", true, func() bool { return isValidPhoneNumber("08012345678") }},
		{"valid ng phone (+234)", true, func() bool { return isValidPhoneNumber("+2348012345678") }},
		{"too short phone", false, func() bool { return isValidPhoneNumber("0801234") }},
		{"non-numeric phone", false, func() bool { return isValidPhoneNumber("0801234567a") }},
		{"valid 11-digit id", true, func() bool { return isValidIDNumber("77777777777") }},
		{"short id", false, func() bool { return isValidIDNumber("123") }},
		{"non-numeric id", false, func() bool { return isValidIDNumber("7777777777a") }},
		{"past dob", true, func() bool { return isValidDOB("1975-01-01") }},
		{"future dob", false, func() bool { return isValidDOB("2099-01-01") }},
		{"malformed dob", false, func() bool { return isValidDOB("not-a-date") }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := c.fn(); got != c.ok {
				t.Errorf("%s: expected %v, got %v", c.name, c.ok, got)
			}
		})
	}
}
