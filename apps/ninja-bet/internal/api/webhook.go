package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/google/uuid"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

// WebhookReceiver handles "verification.completed" deliveries from Ninja's
// hosted KYC flow — the real conclusion of StartFaceVerification, once an
// actual human has completed the selfie/liveness check. Every delivery is
// persisted regardless of outcome, same pattern as the parent repo's
// internal/handlers/webhook.go.
// POST /webhooks/ninja
func (e *Env) WebhookReceiver(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}

	secret := os.Getenv("NINJA_WEBHOOK_SECRET")
	signature := r.Header.Get("X-Ninja-Signature")
	signatureOK := secret != "" && ninja.VerifyWebhookSignature(secret, body, signature)

	var envelope ninja.WebhookEnvelope
	_ = json.Unmarshal(body, &envelope)
	event := envelope.Event
	if event == "" {
		var probe struct {
			Event string `json:"event"`
		}
		_ = json.Unmarshal(body, &probe)
		event = probe.Event
	}

	deliveryID := r.Header.Get("X-Ninja-Delivery-Id")
	eventID := uuid.NewString()
	if err := betdb.InsertWebhookEvent(e.DB, eventID, event, deliveryID, string(body), signatureOK); err != nil {
		log.Printf("insert webhook event: %v", err)
	}

	if !signatureOK {
		log.Printf("webhook %s: signature verification failed, rejecting", eventID)
		_ = betdb.MarkWebhookEventProcessed(e.DB, eventID, errSignatureInvalid)
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	payload := envelope.Data
	if len(payload) == 0 {
		payload = body
	}

	var procErr error
	switch event {
	case "verification.completed":
		procErr = e.handleVerificationCompleted(payload)
	default:
		log.Printf("webhook %s: unrecognized event %q, storing only", eventID, event)
	}

	_ = betdb.MarkWebhookEventProcessed(e.DB, eventID, procErr)
	if procErr != nil {
		log.Printf("webhook %s: processing error: %v", eventID, procErr)
		http.Error(w, "processing error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

var errSignatureInvalid = signatureError{}

type signatureError struct{}

func (signatureError) Error() string { return "signature verification failed" }

func (e *Env) handleVerificationCompleted(payload json.RawMessage) error {
	var p ninja.VerificationCompletedPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return err
	}
	verificationID := ninja.ExtractVerificationID(payload)
	raw, _ := json.Marshal(p)

	player, err := betdb.GetPlayerByFaceVerificationID(e.DB, verificationID)
	if err != nil {
		return err
	}
	if player == nil {
		log.Printf("verification.completed for unknown verification_id %s: storing event only", verificationID)
		return nil
	}

	status := "failed"
	if ninja.IsPass(p.Outcome) {
		status = "passed"
	}
	return betdb.UpdatePlayerFaceVerificationOutcome(e.DB, verificationID, status, p.Score, string(raw))
}
