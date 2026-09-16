// Package api holds ninja-bank's JSON HTTP handlers — an ops console
// talks to these over fetch(), so every handler reads/writes JSON.
package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/bernardoko/ninja-demo/internal/ninja"
)

type Env struct {
	DB    *sql.DB
	Ninja *ninja.Client
	// CORSOrigin is the HAM dev server origin allowed to call this API
	// with credentials in dev. Empty in production, where the Go server
	// serves the built frontend itself (same origin, no CORS needed).
	CORSOrigin string
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

// CORS wraps the mux so a separately-hosted dev frontend can call this API.
func (e *Env) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if e.CORSOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", e.CORSOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
