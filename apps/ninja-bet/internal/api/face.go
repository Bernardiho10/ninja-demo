package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

const cfgFaceVerificationFlowID = "face_verification_flow_id"

// ensureFaceVerificationFlow creates ninja-bet's hosted KYC flow once,
// idempotently — same pattern as the parent repo's internal/handlers/env.go
// ensureKYCFlow. SelfieRequired/LivenessRequired are what actually turn
// this into a facial-verification flow rather than a plain name/DOB one;
// see the comment on ninja.CreateFlowRequest for how that was confirmed.
func (e *Env) ensureFaceVerificationFlow(w http.ResponseWriter, r *http.Request) (string, bool) {
	ctx := r.Context()
	if id, _ := betdb.GetConfig(e.DB, cfgFaceVerificationFlowID); id != "" {
		return id, true
	}
	resp, err := e.Ninja.CreateFlow(ctx, ninja.CreateFlowRequest{
		Name:             "ninja-bet Facial Verification",
		IDTypes:          []string{"nin"},
		SelfieRequired:   true,
		LivenessRequired: true,
		// PublicURL/WebhookPublicURL are both full base URLs including any
		// path prefix this app is mounted under (e.g. https://host/ninja-bet
		// in production, where a reverse proxy routes that whole path to
		// this process) — see apps/ninja-bet/tutor.md Chapter 12 for how
		// that's configured per environment.
		RedirectURL: e.PublicURL + "/play.html?face=complete",
		WebhookURL:  e.WebhookPublicURL + "/webhooks/ninja",
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not create hosted verification flow: "+err.Error())
		return "", false
	}
	if err := betdb.SetConfig(e.DB, cfgFaceVerificationFlowID, resp.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save flow id")
		return "", false
	}
	return resp.ID, true
}

// StartFaceVerification is the second identity signal beyond identify()'s
// name-matching: even someone who knows the correct name and NIN for a
// stolen identity still has to physically look like the registry photo and
// pass a liveness check. Unlike identify(), Ninja's sandbox has no fixed
// fixture for this — a real human has to complete the hosted flow for
// there to be a real pass/fail outcome; this endpoint only gets as far as
// creating that real, one-time link.
// POST /api/players/me/verify-face
func (e *Env) StartFaceVerification(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}

	flowID, ok := e.ensureFaceVerificationFlow(w, r)
	if !ok {
		return
	}

	link, err := e.Ninja.CreateFlowLink(r.Context(), flowID, ninja.CreateFlowLinkRequest{
		CustomerName: player.FullName(),
		CustomerRef:  player.ID,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not create verification link: "+err.Error())
		return
	}

	if err := betdb.UpdatePlayerFaceVerificationStarted(e.DB, player.ID, link.ID, link.URL); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save verification link")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"verification_id":  link.ID,
		"verification_url": link.URL,
		"expires_at":       link.ExpiresAt,
	})
}

// SimulateFaceVerificationOutcome is a demo-only convenience — completing
// Ninja's real hosted selfie/liveness flow requires an actual human, so
// this exists to demonstrate what a pass or fail *does* to the account
// without waiting on that. It never calls Ninja and is logged to api_logs
// as is_mock so the Inspector never shows it as a real sandbox result —
// same honesty pattern as the parent repo's EmployeeSimulateLiveness.
// POST /api/players/me/simulate-face-verification
func (e *Env) SimulateFaceVerificationOutcome(w http.ResponseWriter, r *http.Request) {
	player := e.currentPlayer(r)
	if player == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var req struct {
		Outcome string `json:"outcome"` // "passed" | "failed"
	}
	if err := decodeJSON(r, &req); err != nil || (req.Outcome != "passed" && req.Outcome != "failed") {
		writeError(w, http.StatusBadRequest, `outcome must be "passed" or "failed"`)
		return
	}

	score := 0.02
	raw := map[string]any{
		"simulated": true,
		"outcome":   req.Outcome,
		"note":      "no real selfie/liveness check ran — this endpoint models the outcome for demo purposes only",
	}
	if req.Outcome == "passed" {
		score = 0.97
	}
	raw["score"] = score
	rawJSON, _ := json.Marshal(raw)

	verificationID := player.FaceVerificationID.String
	if verificationID == "" {
		verificationID = "simulated_" + player.ID
	}
	if err := betdb.UpdatePlayerFaceVerificationStarted(e.DB, player.ID, verificationID, ""); err != nil {
		writeError(w, http.StatusInternalServerError, "could not simulate outcome")
		return
	}
	if err := betdb.UpdatePlayerFaceVerificationOutcome(e.DB, verificationID, req.Outcome, score, string(rawJSON)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not simulate outcome")
		return
	}
	_ = betdb.InsertAPILog(e.DB, uuid.NewString(), "/api/players/me/simulate-face-verification", "POST", 200, 0, "", string(rawJSON), true)

	writeJSON(w, http.StatusOK, map[string]any{"status": req.Outcome, "message": "Simulated — no real selfie/liveness check ran."})
}
