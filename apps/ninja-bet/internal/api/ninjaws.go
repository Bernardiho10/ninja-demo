package api

import (
	"net/http"

	"github.com/bernardoko/ninja-demo/internal/ninja"
)

// CompanyLookup handles POST /api/company/lookup (₦550) — basic CAC verification.
func (e *Env) CompanyLookup(w http.ResponseWriter, r *http.Request) {
	var req ninja.CompanyLookupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	resp, err := e.Ninja.CompanyLookup(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// CompanyAdvancedLookup handles POST /api/company/advanced-lookup (₦1,200) — detailed CAC verification.
func (e *Env) CompanyAdvancedLookup(w http.ResponseWriter, r *http.Request) {
	var req ninja.CompanyAdvancedLookupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	resp, err := e.Ninja.CompanyAdvancedLookup(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// BulkIdentify handles POST /api/identity/bulk-identify (up to 25 IDs).
func (e *Env) BulkIdentify(w http.ResponseWriter, r *http.Request) {
	var req ninja.BulkIdentifyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	resp, err := e.Ninja.BulkIdentify(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// ListWebhookDeliveries handles GET /api/webhook-deliveries.
func (e *Env) ListWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	deliveries, err := e.Ninja.ListWebhookDeliveries(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, deliveries)
}

// RetryWebhookDelivery handles POST /api/webhook-deliveries/{id}/retry.
func (e *Env) RetryWebhookDelivery(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing delivery id")
		return
	}
	if err := e.Ninja.RetryWebhookDelivery(r.Context(), id); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "Delivery retry dispatched"})
}
