package api

import (
	"net/http"

	"github.com/google/uuid"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
)

type placeBetRequest struct {
	MatchEvent string  `json:"match_event"`
	Selection  string  `json:"selection"`
	Odds       float64 `json:"odds"`
	StakeNaira float64 `json:"stake_naira"`
}

// PlaceBet is gated on player.CanTransact() — true for a clean first-time
// verification AND for a detected duplicate identity (flagged_duplicate_identity:
// still a real person, just no second welcome bonus), false for underage or
// name-mismatch accounts with no reliable identity to bet against.
// POST /api/bets
func (e *Env) PlaceBet(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	if player.SelfExcluded {
		writeError(w, http.StatusForbidden, "account is self-excluded from betting")
		return
	}
	if !player.CanTransact() {
		writeError(w, http.StatusForbidden, "identity verification required before placing real-money wagers")
		return
	}

	var req placeBetRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Odds <= 1.0 {
		req.Odds = 2.10
	}
	if req.StakeNaira <= 0 {
		req.StakeNaira = 5000
	}
	stakeKobo := int64(req.StakeNaira * 100)
	if player.BalanceKobo < stakeKobo {
		writeError(w, http.StatusPaymentRequired, "insufficient balance for this stake")
		return
	}

	newBalance := player.BalanceKobo - stakeKobo
	_ = betdb.UpdatePlayerBalance(e.DB, player.ID, newBalance, player.WinningsKobo)
	betID := uuid.NewString()
	_ = betdb.InsertBet(e.DB, betID, player.ID, req.MatchEvent, req.Selection, req.Odds, stakeKobo, "placed")

	writeJSON(w, http.StatusCreated, map[string]any{
		"bet_id":             betID,
		"potential_win_kobo": int64(float64(stakeKobo) * req.Odds),
		"balance_kobo":       newBalance,
	})
}

// SimulateWin is a demo-only helper (no Ninja call) so a presenter can get to
// the payout gate without waiting for a real match to finish.
// POST /api/bets/simulate-win
func (e *Env) SimulateWin(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	winKobo := int64(25000000) // ₦250,000
	newWinnings := player.WinningsKobo + winKobo
	_ = betdb.UpdatePlayerBalance(e.DB, player.ID, player.BalanceKobo, newWinnings)
	_ = betdb.InsertBet(e.DB, uuid.NewString(), player.ID, "Arsenal 2 - 1 Chelsea (Premier League)", "Arsenal to Win (WON)", 2.45, 5000000, "won")

	writeJSON(w, http.StatusOK, map[string]any{
		"winnings_kobo": newWinnings,
	})
}

// ListBets returns the current player's recent bet history.
// GET /api/bets
func (e *Env) ListBets(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	bets, err := betdb.ListBetsByPlayer(e.DB, player.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load bets")
		return
	}
	writeJSON(w, http.StatusOK, bets)
}
