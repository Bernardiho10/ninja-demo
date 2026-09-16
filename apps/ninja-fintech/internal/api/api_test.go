package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	fdb "github.com/bernardoko/ninja-demo/apps/ninja-fintech/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

func setupTestEnv(t *testing.T) *Env {
	t.Helper()
	conn, err := fdb.Open(":memory:")
	if err != nil {
		t.Fatalf("open memory db: %v", err)
	}
	client := ninja.NewClient("https://api.sandbox.ninja.boucloud.io", "key", "secret")
	client.SetMockMode(true)
	return &Env{DB: conn, Ninja: client}
}

func onboard(t *testing.T, e *Env, fullName, dob, idType, idNumber string) (*httptest.ResponseRecorder, customerView) {
	t.Helper()
	body, _ := json.Marshal(onboardRequest{FullName: fullName, DateOfBirth: dob, IDType: idType, IDNumber: idNumber})
	req := httptest.NewRequest("POST", "/api/customers", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	e.OnboardCustomer(rec, req)

	var resp struct {
		Customer customerView `json:"customer"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	return rec, resp.Customer
}

// TestOnboardVerifiedCustomer exercises the clean-match mock fixture — a
// name/NIN pair that matches exactly should onboard, not just verify.
func TestOnboardVerifiedCustomer(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	rec, customer := onboard(t, e, "James Bond", "1975-01-01", "nin", "77777777777")
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if customer.Status != "onboarded" {
		t.Fatalf("expected onboarded, got %s", customer.Status)
	}
	if customer.Tier != 1 || customer.DailyLimitKobo != 5000000 {
		t.Fatalf("expected Tier 1 / ₦50,000 daily limit for a fresh customer, got tier=%d limit=%d", customer.Tier, customer.DailyLimitKobo)
	}
	if len(customer.Fields) == 0 {
		t.Fatal("expected per-field match detail, got none — that's the whole point of this app over a blunt pass/fail")
	}
}

// TestOnboardMismatchFlagsForReview is the core business rule: a name
// that doesn't match the ID on file must flag the account, not onboard it.
func TestOnboardMismatchFlagsForReview(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, customer := onboard(t, e, "Totally Different Person", "1975-01-01", "nin", "77777777777")
	if customer.Status != "flagged_review" {
		t.Fatalf("expected flagged_review for a mismatched name, got %s", customer.Status)
	}
}

// TestTransferHeldForFlaggedAccount: a flagged account can't transact at
// ANY amount — the compliance gate runs before the tier-limit check.
func TestTransferHeldForFlaggedAccount(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, customer := onboard(t, e, "Totally Different Person", "1975-01-01", "nin", "77777777777")

	body, _ := json.Marshal(transferRequest{AmountNaira: 1000, RecipientName: "Adeola Trading", RecipientBank: "Zenith Bank", RecipientAccount: "1029384756"})
	req := httptest.NewRequest("POST", "/api/customers/"+customer.ID+"/transfer", bytes.NewReader(body))
	req.SetPathValue("id", customer.ID)
	rec := httptest.NewRecorder()
	e.RequestTransfer(rec, req)

	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["status"] != "held_re_kyc" {
		t.Fatalf("expected held_re_kyc for a flagged account regardless of amount, got %v — %s", resp["status"], rec.Body.String())
	}
}

// TestTransferBlockedByTierLimit: a verified, onboarded account still
// can't move more than its tier allows in one transfer.
func TestTransferBlockedByTierLimit(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, customer := onboard(t, e, "James Bond", "1975-01-01", "nin", "77777777777")

	body, _ := json.Marshal(transferRequest{AmountNaira: 250000, RecipientName: "Adeola Trading", RecipientBank: "Zenith Bank", RecipientAccount: "1029384756"})
	req := httptest.NewRequest("POST", "/api/customers/"+customer.ID+"/transfer", bytes.NewReader(body))
	req.SetPathValue("id", customer.ID)
	rec := httptest.NewRecorder()
	e.RequestTransfer(rec, req)

	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["status"] != "blocked_tier_limit" {
		t.Fatalf("expected blocked_tier_limit for ₦250,000 against a ₦50,000 Tier 1 limit, got %v — %s", resp["status"], rec.Body.String())
	}
}

// TestUpgradeTierRequiresClearedStatus: a flagged account can't be
// upgraded — the ops action is gated on Ninja's verification having
// actually cleared, not something an operator can just override.
func TestUpgradeTierRequiresClearedStatus(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, customer := onboard(t, e, "Totally Different Person", "1975-01-01", "nin", "77777777777")

	req := httptest.NewRequest("POST", "/api/customers/"+customer.ID+"/upgrade-tier", nil)
	req.SetPathValue("id", customer.ID)
	rec := httptest.NewRecorder()
	e.UpgradeTier(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 upgrading a flagged account's tier, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestReKYCUpdatesStatus confirms re-KYC re-runs the real identify call
// and overwrites the existing customer's status rather than creating a
// second record.
func TestReKYCUpdatesStatus(t *testing.T) {
	e := setupTestEnv(t)
	defer e.DB.Close()

	_, customer := onboard(t, e, "James Bond", "1975-01-01", "nin", "77777777777")

	req := httptest.NewRequest("POST", "/api/customers/"+customer.ID+"/re-kyc", nil)
	req.SetPathValue("id", customer.ID)
	rec := httptest.NewRecorder()
	e.ReKYC(rec, req)

	var resp struct {
		Customer customerView `json:"customer"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Customer.Status != "re_kyc_cleared" {
		t.Fatalf("expected re_kyc_cleared re-checking an already-matching identity, got %s", resp.Customer.Status)
	}

	all, err := fdb.ListFintechCustomers(e.DB)
	if err != nil {
		t.Fatalf("list customers: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("expected re-KYC to update the existing customer, not create a new one — got %d customers", len(all))
	}
}
