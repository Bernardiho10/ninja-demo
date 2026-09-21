package api

import (
	"net/http"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
)

// SelfExclude is pure local business logic — no Ninja call. It exists to
// contrast with Register/RequestPayout: not every compliance rule needs
// the sandbox, only the ones that depend on a government-verified fact
// (age, identity match) do.
// POST /api/players/me/self-exclude
func (e *Env) SelfExclude(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	_ = betdb.SetPlayerSelfExcluded(e.DB, player.ID)
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Account added to the self-exclusion registry. Betting, deposits, and withdrawals are frozen.",
	})
}

// ResetDemo restores a clean starting state for repeat presentations.
// POST /api/demo/reset
func (e *Env) ResetDemo(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player != nil {
		_ = betdb.ResetPlayer(e.DB, player.ID)
	}
	_, _ = e.DB.Exec("DELETE FROM sessions")
	_, _ = e.DB.Exec("DELETE FROM bets")
	_, _ = e.DB.Exec("DELETE FROM payouts")
	_, _ = e.DB.Exec("DELETE FROM deposits")
	_, _ = e.DB.Exec("DELETE FROM players WHERE phone_number = '08012345678'")
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Demo state reset.",
	})
}

// CallLog is the "Ninja Call Inspector" data source — every real request and
// response this app has sent to/received from the sandbox, verbatim.
// GET /api/admin/logs
func (e *Env) CallLog(w http.ResponseWriter, r *http.Request) {
	logs, err := betdb.ListRecentAPILogs(e.DB, 30)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load call log")
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

// Impact is a set of real counts and sums over this app's own data —
// every number here traces back to an actual identify() call this app
// made, not a marketing figure. Surfaced on the fraud-signals page.
// GET /api/admin/impact
func (e *Env) Impact(w http.ResponseWriter, r *http.Request) {
	summary, err := betdb.GetImpactSummary(e.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load impact summary")
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

type fraudSignalGroup struct {
	IDNumber string              `json:"id_number"`
	Accounts []fraudSignalPlayer `json:"accounts"`
}

type fraudSignalPlayer struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	KYCStatus string `json:"kyc_status"`
	CreatedAt string `json:"created_at"`
}

// FraudSignals lists every NIN tied to more than one account — the "one
// identity behind N accounts" view a compliance officer would use.
// GET /api/admin/fraud-signals
func (e *Env) FraudSignals(w http.ResponseWriter, r *http.Request) {
	groups, err := betdb.ListDuplicateIdentityGroups(e.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load fraud signals")
		return
	}
	out := make([]fraudSignalGroup, 0, len(groups))
	for _, g := range groups {
		players, err := betdb.ListPlayersByIdentity(e.DB, g.IDNumber)
		if err != nil {
			continue
		}
		accounts := make([]fraudSignalPlayer, 0, len(players))
		for _, p := range players {
			accounts = append(accounts, fraudSignalPlayer{
				FirstName: p.FirstName, LastName: p.LastName, KYCStatus: p.KYCStatus, CreatedAt: p.CreatedAt,
			})
		}
		out = append(out, fraudSignalGroup{IDNumber: g.IDNumber, Accounts: accounts})
	}
	writeJSON(w, http.StatusOK, out)
}
