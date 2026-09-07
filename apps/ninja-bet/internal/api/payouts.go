package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

type requestPayoutRequest struct {
	AmountNaira     float64 `json:"amount_naira"`
	BeneficiaryName string  `json:"beneficiary_name"`
	BankName        string  `json:"bank_name"`
	AccountNumber   string  `json:"account_number"`
	BVN             string  `json:"bvn"`
}

// faceScoreDescription renders what's on file for the liveness gate's audit
// trail — distinguishes "never attempted" from "attempted but too low".
func faceScoreDescription(player *betdb.Player) string {
	if !player.FaceVerificationStatus.Valid {
		return "no facial verification on file"
	}
	if !player.FaceScore.Valid {
		return fmt.Sprintf("status %s, no score recorded", player.FaceVerificationStatus.String)
	}
	return fmt.Sprintf("status %s, score %.0f%%", player.FaceVerificationStatus.String, player.FaceScore.Float64*100)
}

// splitName divides a full name into first/last for the Ninja verify call —
// only the first and last token matter to identify(mode=verify); a middle
// name in between is dropped rather than guessed at.
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

// RequestPayout is the withdrawal-fraud defense: the player names a bank
// account to withdraw to, and identify(mode=verify) checks whether THAT
// NAME matches the NIN on file — not just whether the player's own session
// is still alive. A stolen session or a mule account withdrawing to
// somebody else's bank account fails here even if the player's own
// identity was verified perfectly at registration.
// POST /api/payouts/request
func (e *Env) RequestPayout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}

	var req requestPayoutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AmountNaira <= 0 {
		req.AmountNaira = 250000
	}
	amountKobo := int64(req.AmountNaira * 100)
	req.BeneficiaryName = strings.TrimSpace(req.BeneficiaryName)
	req.BankName = strings.TrimSpace(req.BankName)
	req.AccountNumber = strings.TrimSpace(req.AccountNumber)
	req.BVN = strings.TrimSpace(req.BVN)
	if req.BeneficiaryName == "" || req.BankName == "" || req.AccountNumber == "" || req.BVN == "" {
		writeError(w, http.StatusBadRequest, "beneficiary_name, bank_name, account_number, and bvn are required")
		return
	}
	if !isValidIDNumber(req.BVN) {
		writeError(w, http.StatusBadRequest, "bvn must be 11 digits")
		return
	}

	// Compliance gates run before business checks, and before each other in
	// order of how little they depend on: an account with no reliable
	// identity at all (never made it past registration cleanly) can't
	// withdraw regardless of balance or self-exclusion status.
	if !player.CanTransact() {
		writeError(w, http.StatusForbidden, "identity verification did not pass at registration — payouts are not available on this account")
		return
	}
	if player.SelfExcluded {
		payoutID := uuid.NewString()
		_ = betdb.InsertPayout(e.DB, payoutID, player.ID, amountKobo, req.BeneficiaryName, req.BankName, req.AccountNumber, "blocked_self_excluded", "account is on the self-exclusion registry; payouts frozen", "")
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "blocked_self_excluded",
			"message": "Payout blocked: this account is on the self-exclusion registry.",
		})
		return
	}
	if player.WinningsKobo < amountKobo {
		writeError(w, http.StatusPaymentRequired, "insufficient winnings balance")
		return
	}

	// Layer-2 payout security: a stolen session or a saved bank detail
	// changed by an attacker still can't move money out unless the most
	// recent facial-verification liveness score clears the player's own
	// threshold — independent of, and in addition to, the beneficiary-name
	// check below. On by default (see schema.sql); the player controls the
	// threshold in Account settings.
	if player.RequireFaceForPayout {
		passed := player.FaceVerificationStatus.Valid && player.FaceVerificationStatus.String == "passed"
		meetsThreshold := player.FaceScore.Valid && player.FaceScore.Float64 >= player.LivenessThreshold
		if !passed || !meetsThreshold {
			payoutID := uuid.NewString()
			reason := fmt.Sprintf("liveness gate: required score >= %.0f%%, player has %s", player.LivenessThreshold*100, faceScoreDescription(player))
			_ = betdb.InsertPayout(e.DB, payoutID, player.ID, amountKobo, req.BeneficiaryName, req.BankName, req.AccountNumber, "blocked_liveness_required", reason, "")
			writeJSON(w, http.StatusOK, map[string]any{
				"status": "blocked_liveness_required",
				"message": fmt.Sprintf(
					"Payout blocked: your account requires a passed facial verification with a liveness score of at least %.0f%% before any withdrawal. Complete facial verification in Account settings, then try again.",
					player.LivenessThreshold*100,
				),
			})
			return
		}
	}

	beneficiaryFirst, beneficiaryLast := splitName(req.BeneficiaryName)
	start := time.Now()
	result, err := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
		IDType:      player.IDType,
		Mode:        "verify",
		IDNumber:    player.IDNumber,
		FirstName:   beneficiaryFirst,
		LastName:    beneficiaryLast,
		DateOfBirth: player.DateOfBirth.String,
		Reference:   "ninjabet_payout_" + uuid.NewString()[:8],
	})
	duration := time.Since(start).Milliseconds()
	if err != nil {
		writeError(w, http.StatusBadGateway, "payout identity check failed: "+err.Error())
		return
	}

	raw, _ := json.Marshal(result)

	var status, message, reason string
	switch {
	case !result.Found || !result.Verified:
		status = "blocked_beneficiary_mismatch"
		reason = "beneficiary account name does not match the verified NIN holder"
		message = "Payout denied: \"" + req.BeneficiaryName + "\" on the " + req.BankName + " account doesn't match the identity verified on this NIN. This is the mule-account defense — withdrawing to someone else's account fails even from a fully verified ninja-bet profile."
	default:
		// The NIN check confirms the TYPED beneficiary name matches the
		// player's own verified NIN — but says nothing about who actually
		// owns the destination bank account. The BVN is Nigeria's banking
		// identity number; verifying it independently confirms the account
		// itself, not just a name typed into a form, belongs to the same
		// person — a name can be typed correctly for an account that isn't
		// really theirs, a BVN can't.
		bvnResult, bvnErr := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
			IDType:      "bvn",
			Mode:        "verify",
			IDNumber:    req.BVN,
			FirstName:   beneficiaryFirst,
			LastName:    beneficiaryLast,
			DateOfBirth: player.DateOfBirth.String,
			Reference:   "ninjabet_payout_bvn_" + uuid.NewString()[:8],
		})
		switch {
		case bvnErr != nil:
			writeError(w, http.StatusBadGateway, "payout BVN check failed: "+bvnErr.Error())
			return
		case !bvnResult.Found || !bvnResult.Verified:
			status = "blocked_bvn_mismatch"
			reason = "bank account BVN does not match the name/DOB verified on the NIN"
			message = "Payout denied: the BVN on file for this bank account doesn't match \"" + req.BeneficiaryName + "\"'s verified identity. The account name can be typed correctly while the bank account itself belongs to someone else — this is exactly what the BVN check catches."
			bvnRaw, _ := json.Marshal(bvnResult)
			raw = bvnRaw
		default:
			status = "approved"
			reason = fmt.Sprintf("beneficiary name re-verified against NIN (score %.0f%%) and BVN (score %.0f%%)", result.Score*100, bvnResult.Score*100)
			message = "Payout of the requested amount approved to " + req.BeneficiaryName + " (" + req.BankName + ") — beneficiary name matched both the verified NIN holder and the bank account's BVN."
			newWinnings := max(player.WinningsKobo-amountKobo, 0)
			_ = betdb.UpdatePlayerBalance(e.DB, player.ID, player.BalanceKobo, newWinnings)
		}
	}

	payoutID := uuid.NewString()
	_ = betdb.InsertPayout(e.DB, payoutID, player.ID, amountKobo, req.BeneficiaryName, req.BankName, req.AccountNumber, status, reason, string(raw))

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      status,
		"message":     message,
		"duration_ms": duration,
		"score":       result.Score,
	})
}

// ListPayouts returns the current player's payout history.
// GET /api/payouts
func (e *Env) ListPayouts(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	payouts, err := betdb.ListPayoutsByPlayer(e.DB, player.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load payouts")
		return
	}
	writeJSON(w, http.StatusOK, payouts)
}
