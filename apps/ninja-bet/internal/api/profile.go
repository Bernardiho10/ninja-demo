package api

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
)

type saveBankDetailsRequest struct {
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
}

// securityTiers maps the three preset strictness labels the frontend
// offers to a liveness-score threshold — kept as a fixed, named set rather
// than a free-form number so a player can't accidentally configure
// something meaningless (1%, 100%) while still understanding the tradeoff
// each tier represents.
var securityTiers = map[string]float64{
	"low":    0.70,
	"medium": 0.85,
	"high":   0.95,
}

type securitySettingsRequest struct {
	RequireFaceForPayout bool   `json:"require_face_for_payout"`
	Tier                 string `json:"tier"` // low | medium | high
}

// SaveSecuritySettings is the layer-2 payout gate's control: whether every
// withdrawal must re-check a recent liveness score, and at what strictness.
// See RequestPayout (payouts.go) for the enforcement side.
// POST /api/players/me/security-settings
func (e *Env) SaveSecuritySettings(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var req securitySettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	threshold, ok := securityTiers[req.Tier]
	if !ok {
		writeError(w, http.StatusBadRequest, "tier must be low, medium, or high")
		return
	}
	if err := betdb.UpdatePlayerSecuritySettings(e.DB, player.ID, req.RequireFaceForPayout, threshold); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save security settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "Security settings saved."})
}

// SaveBankDetails saves a payout destination so the withdrawal form can
// pre-fill it next time. Purely a convenience — the payout endpoint still
// re-verifies whatever name is on the request at withdrawal time, saved or
// not, so saving details here doesn't weaken the beneficiary check.
// POST /api/players/me/bank-details
func (e *Env) SaveBankDetails(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var req saveBankDetailsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.BankName = strings.TrimSpace(req.BankName)
	req.AccountNumber = strings.TrimSpace(req.AccountNumber)
	if req.BankName == "" || req.AccountNumber == "" {
		writeError(w, http.StatusBadRequest, "bank_name and account_number are required")
		return
	}
	if err := betdb.UpdatePlayerBankDetails(e.DB, player.ID, req.BankName, req.AccountNumber); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save bank details")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Bank details saved."})
}

type depositRequest struct {
	AmountNaira float64 `json:"amount_naira"`
	Method      string  `json:"method"` // card | bank_transfer | ussd
}

// Deposit credits the player's balance. No real money moves — same as the
// welcome bonus, this models the UX of a real sportsbook's deposit flow so
// there's a normal, non-bonus way to fund the account for betting.
// POST /api/deposits
func (e *Env) Deposit(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var req depositRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AmountNaira <= 0 {
		req.AmountNaira = 5000
	}
	if req.Method == "" {
		req.Method = "card"
	}
	amountKobo := int64(req.AmountNaira * 100)

	newBalance := player.BalanceKobo + amountKobo
	if err := betdb.UpdatePlayerBalance(e.DB, player.ID, newBalance, player.WinningsKobo); err != nil {
		writeError(w, http.StatusInternalServerError, "could not credit deposit")
		return
	}
	if err := betdb.InsertDeposit(e.DB, uuid.NewString(), player.ID, amountKobo, req.Method); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record deposit")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"balance_kobo": newBalance})
}

// ListDeposits returns the current player's deposit history.
// GET /api/deposits
func (e *Env) ListDeposits(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	deposits, err := betdb.ListDepositsByPlayer(e.DB, player.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load deposits")
		return
	}
	writeJSON(w, http.StatusOK, deposits)
}
