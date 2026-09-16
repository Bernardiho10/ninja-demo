package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	fdb "github.com/bernardoko/ninja-demo/apps/ninja-fintech/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

// splitName divides a full name into first/last for the Ninja verify call —
// only the first and last token matter to identify(mode=verify); a middle
// name in between is dropped rather than guessed at. Same helper as
// ninja-bet's internal/api/payouts.go.
func splitName(fullName string) (first, last string) {
	parts := strings.Fields(fullName)
	if len(parts) == 0 {
		return "", ""
	}
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], parts[len(parts)-1]
}

// bucketRecommendation mirrors Ninja's documented default thresholds (90%
// accept, 60% review) as a fallback for sandbox responses that omit
// `recommendation` on the raw identify call — same bucketing the original
// prototype (internal/handlers/fintech.go) used, carried over because it's
// already proven against the sandbox.
func bucketRecommendation(score float64) string {
	pct := score
	if pct <= 1.0 {
		pct = pct * 100
	}
	switch {
	case pct >= 85:
		return "accept"
	case pct >= 60:
		return "review"
	default:
		return "reject"
	}
}

// statusFromRecommendation maps Ninja's recommendation onto this app's own
// business status — the distinction between "onboarded"/"flagged_review"
// (first contact) and "re_kyc_cleared"/"re_kyc_failed" (a second look at an
// existing customer) is local business logic, not something Ninja returns.
func statusFromRecommendation(isReKYC bool, recommendation string) string {
	switch recommendation {
	case "accept":
		if isReKYC {
			return "re_kyc_cleared"
		}
		return "onboarded"
	case "reject":
		if isReKYC {
			return "re_kyc_failed"
		}
		return "flagged_review"
	default: // review
		return "flagged_review"
	}
}

func normalizeScore(score float64) float64 {
	if score > 1.0 {
		return score / 100
	}
	return score
}

type onboardRequest struct {
	FullName    string `json:"full_name"`
	DateOfBirth string `json:"date_of_birth"`
	IDType      string `json:"id_type"`
	IDNumber    string `json:"id_number"`
}

type customerView struct {
	ID             string         `json:"id"`
	FullName       string         `json:"full_name"`
	DateOfBirth    string         `json:"date_of_birth"`
	IDType         string         `json:"id_type"`
	IDNumber       string         `json:"id_number"`
	Score          float64        `json:"score"`
	Recommendation string         `json:"recommendation"`
	Fields         []ninja.MatchField `json:"fields"`
	Status         string         `json:"status"`
	Tier           int            `json:"tier"`
	DailyLimitKobo int64          `json:"daily_limit_kobo"`
	BalanceKobo    int64          `json:"balance_kobo"`
	LastCheckedAt  string         `json:"last_checked_at"`
	CreatedAt      string         `json:"created_at"`
}

func toCustomerView(c *fdb.FintechCustomer) customerView {
	var fields []ninja.MatchField
	_ = json.Unmarshal([]byte(c.FieldsRaw), &fields)
	return customerView{
		ID: c.ID, FullName: c.FullName, DateOfBirth: c.DateOfBirth, IDType: c.IDType, IDNumber: c.IDNumber,
		Score: c.Score, Recommendation: c.Recommendation, Fields: fields, Status: c.Status,
		Tier: c.Tier, DailyLimitKobo: c.DailyLimitKobo, BalanceKobo: c.BalanceKobo,
		LastCheckedAt: c.LastCheckedAt, CreatedAt: c.CreatedAt,
	}
}

// OnboardCustomer is the entry point — identify(mode=verify) called
// server-side against the real sandbox, surfacing Ninja's PER-FIELD score
// (first_name/last_name/date_of_birth each scored separately) rather than
// a blunt pass/fail. This is the thing "Fintechs" actually need that a
// yes/no check doesn't give them: a typo is a different risk than a
// completely different person, and the per-field detail is what tells
// them apart.
// POST /api/customers
func (e *Env) OnboardCustomer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req onboardRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.FullName = strings.TrimSpace(req.FullName)
	req.DateOfBirth = strings.TrimSpace(req.DateOfBirth)
	req.IDType = strings.TrimSpace(req.IDType)
	req.IDNumber = strings.TrimSpace(req.IDNumber)
	if req.FullName == "" || req.DateOfBirth == "" || req.IDType == "" || req.IDNumber == "" {
		writeError(w, http.StatusBadRequest, "full_name, date_of_birth, id_type, and id_number are required")
		return
	}
	if req.IDType != "nin" && req.IDType != "bvn" {
		writeError(w, http.StatusBadRequest, "id_type must be nin or bvn")
		return
	}

	first, last := splitName(req.FullName)
	result, err := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
		IDType:      req.IDType,
		Mode:        "verify",
		IDNumber:    req.IDNumber,
		FirstName:   first,
		LastName:    last,
		DateOfBirth: req.DateOfBirth,
		Reference:   "ninjafintech_onboard_" + uuid.NewString()[:8],
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "identify failed: "+err.Error())
		return
	}

	score := normalizeScore(result.Score)
	recommendation := result.Recommendation
	if recommendation == "" {
		recommendation = bucketRecommendation(score)
	}
	mismatchesJSON, _ := json.Marshal(result.Mismatches())
	fieldsJSON, _ := json.Marshal(result.Fields)
	status := statusFromRecommendation(false, recommendation)

	customerID := uuid.NewString()
	if err := fdb.InsertFintechCustomer(e.DB, customerID, req.FullName, req.DateOfBirth, req.IDType, req.IDNumber,
		score, recommendation, string(mismatchesJSON), string(fieldsJSON), status); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save customer")
		return
	}

	customer, _ := fdb.GetFintechCustomer(e.DB, customerID)
	writeJSON(w, http.StatusCreated, map[string]any{
		"customer": toCustomerView(customer),
		"message":  onboardMessage(req.FullName, recommendation, score),
	})
}

func onboardMessage(name, recommendation string, score float64) string {
	pct := score * 100
	switch recommendation {
	case "accept":
		return name + " onboarded — identity confirmed via Ninja in real time (" + formatPct(pct) + " match)."
	case "reject":
		return name + " flagged for review — identity verification did not clear (" + formatPct(pct) + " match). No transfers until re-KYC clears."
	default:
		return name + " flagged for review — partial match (" + formatPct(pct) + "). No transfers until re-KYC clears."
	}
}

func formatPct(pct float64) string {
	return fmt.Sprintf("%.0f%%", pct)
}

// ListCustomers returns every onboarded customer, most recent first.
// GET /api/customers
func (e *Env) ListCustomers(w http.ResponseWriter, r *http.Request) {
	customers, err := fdb.ListFintechCustomers(e.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load customers")
		return
	}
	views := make([]customerView, 0, len(customers))
	for _, c := range customers {
		views = append(views, toCustomerView(c))
	}
	writeJSON(w, http.StatusOK, views)
}

// ReKYC re-runs identify(mode=verify) for an existing customer — the
// enhanced-due-diligence workflow a flagged account needs before it can
// transact again. Same call as onboarding, different moment: this is Ninja
// being asked the same question again about someone already in the system.
// POST /api/customers/{id}/re-kyc
func (e *Env) ReKYC(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	customer, err := fdb.GetFintechCustomer(e.DB, id)
	if err != nil || customer == nil {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}

	first, last := splitName(customer.FullName)
	result, err := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
		IDType:      customer.IDType,
		Mode:        "verify",
		IDNumber:    customer.IDNumber,
		FirstName:   first,
		LastName:    last,
		DateOfBirth: customer.DateOfBirth,
		Reference:   "ninjafintech_rekyc_" + uuid.NewString()[:8],
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "re-kyc failed: "+err.Error())
		return
	}

	score := normalizeScore(result.Score)
	recommendation := result.Recommendation
	if recommendation == "" {
		recommendation = bucketRecommendation(score)
	}
	mismatchesJSON, _ := json.Marshal(result.Mismatches())
	fieldsJSON, _ := json.Marshal(result.Fields)
	status := statusFromRecommendation(true, recommendation)

	if err := fdb.UpdateFintechCustomerRecheck(e.DB, id, score, recommendation, string(mismatchesJSON), string(fieldsJSON), status); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save re-kyc result")
		return
	}

	customer, _ = fdb.GetFintechCustomer(e.DB, id)
	writeJSON(w, http.StatusOK, map[string]any{
		"customer": toCustomerView(customer),
		"message":  "Re-KYC result: " + recommendation + " (" + formatPct(score*100) + " match).",
	})
}

// UpgradeTier is a deliberate ops action — Ninja's verification result
// doesn't automatically raise a limit, a compliance team decides to, after
// looking at the re-KYC result themselves.
// POST /api/customers/{id}/upgrade-tier
func (e *Env) UpgradeTier(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	customer, err := fdb.GetFintechCustomer(e.DB, id)
	if err != nil || customer == nil {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	if customer.Status != "onboarded" && customer.Status != "re_kyc_cleared" {
		writeError(w, http.StatusForbidden, "customer must have a cleared verification before a tier upgrade")
		return
	}
	newTier := customer.Tier + 1
	newLimit := customer.DailyLimitKobo * 10 // Tier 2 = ₦500,000, Tier 3 = ₦5,000,000
	if err := fdb.UpdateFintechCustomerTier(e.DB, id, newTier, newLimit); err != nil {
		writeError(w, http.StatusInternalServerError, "could not upgrade tier")
		return
	}
	customer, _ = fdb.GetFintechCustomer(e.DB, id)
	writeJSON(w, http.StatusOK, map[string]any{"customer": toCustomerView(customer)})
}
