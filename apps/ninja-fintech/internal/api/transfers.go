package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	fdb "github.com/bernardoko/ninja-demo/apps/ninja-fintech/internal/db"
)

type transferRequest struct {
	AmountNaira      float64 `json:"amount_naira"`
	RecipientName    string  `json:"recipient_name"`
	RecipientBank    string  `json:"recipient_bank"`
	RecipientAccount string  `json:"recipient_account"`
}

// formatNaira renders kobo as a comma-grouped Naira amount — Go has no
// built-in thousands-separator formatter, so this hand-rolls it rather
// than pulling in a dependency for one function.
func formatNaira(kobo int64) string {
	naira := kobo / 100
	s := fmt.Sprintf("%d", naira)
	if len(s) <= 3 {
		return "₦" + s
	}
	var grouped []byte
	for i, digit := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			grouped = append(grouped, ',')
		}
		grouped = append(grouped, digit)
	}
	return "₦" + string(grouped)
}

// RequestTransfer is where a verification outcome actually costs
// something real: no Ninja call happens here — this is the business
// consequence of the identify() result already on file, not a new check.
// Two independent gates, checked in this order because a flagged
// account can't transact at ANY amount, regardless of tier:
//  1. status must not be flagged_review/re_kyc_failed — an account that
//     hasn't cleared verification is frozen outright.
//  2. the amount must fit within the account's tier daily limit.
// POST /api/customers/{id}/transfer
func (e *Env) RequestTransfer(w http.ResponseWriter, r *http.Request) {
	customerID := r.PathValue("id")
	customer, err := fdb.GetFintechCustomer(e.DB, customerID)
	if err != nil || customer == nil {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}

	var req transferRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AmountNaira <= 0 {
		req.AmountNaira = 250000
	}
	amountKobo := int64(req.AmountNaira * 100)
	req.RecipientName = strings.TrimSpace(req.RecipientName)
	req.RecipientBank = strings.TrimSpace(req.RecipientBank)
	req.RecipientAccount = strings.TrimSpace(req.RecipientAccount)
	if req.RecipientName == "" || req.RecipientBank == "" || req.RecipientAccount == "" {
		writeError(w, http.StatusBadRequest, "recipient_name, recipient_bank, and recipient_account are required")
		return
	}

	if customer.Status == "flagged_review" || customer.Status == "re_kyc_failed" {
		transferID := uuid.NewString()
		reason := "account has a pending or failed compliance review; outbound transfers frozen"
		_ = fdb.InsertFintechTransfer(e.DB, transferID, customerID, req.RecipientName, req.RecipientBank, req.RecipientAccount, amountKobo, "held_re_kyc", reason)
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "held_re_kyc",
			"message": "Transfer held: this account needs a cleared re-KYC before any outbound transfer can go through.",
		})
		return
	}

	if amountKobo > customer.DailyLimitKobo {
		transferID := uuid.NewString()
		reason := fmt.Sprintf("amount %s exceeds Tier %d limit of %s", formatNaira(amountKobo), customer.Tier, formatNaira(customer.DailyLimitKobo))
		_ = fdb.InsertFintechTransfer(e.DB, transferID, customerID, req.RecipientName, req.RecipientBank, req.RecipientAccount, amountKobo, "blocked_tier_limit", reason)
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "blocked_tier_limit",
			"message": fmt.Sprintf(
				"Transfer blocked: %s exceeds this account's Tier %d daily limit of %s.",
				formatNaira(amountKobo), customer.Tier, formatNaira(customer.DailyLimitKobo),
			),
		})
		return
	}

	transferID := uuid.NewString()
	_ = fdb.InsertFintechTransfer(e.DB, transferID, customerID, req.RecipientName, req.RecipientBank, req.RecipientAccount, amountKobo, "completed", "instant settlement cleared")
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "completed",
		"message": fmt.Sprintf("Transfer of %s to %s (%s) sent.", formatNaira(amountKobo), req.RecipientName, req.RecipientBank),
	})
}

// ListTransfers returns a customer's transfer history, most recent first.
// GET /api/customers/{id}/transfers
func (e *Env) ListTransfers(w http.ResponseWriter, r *http.Request) {
	customerID := r.PathValue("id")
	transfers, err := fdb.ListFintechTransfersByCustomer(e.DB, customerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load transfers")
		return
	}
	writeJSON(w, http.StatusOK, transfers)
}
