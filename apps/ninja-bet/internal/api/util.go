// Package api holds ninja-bet's JSON HTTP handlers — a React SPA talks to
// these over fetch(), so every handler reads/writes JSON, never HTML.
package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/bernardoko/ninja-demo/internal/ninja"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
)

type Env struct {
	DB    *sql.DB
	Ninja *ninja.Client
	// CORSOrigin is the Vite dev server origin allowed to call this API with
	// credentials (cookies). In production the built frontend is served by
	// this same Go server, so no cross-origin request happens at all.
	CORSOrigin string
	// PublicURL is the frontend's own address (e.g. http://localhost:5671) —
	// used for redirect_url on hosted flows, where the browser goes back to.
	PublicURL string
	// WebhookPublicURL is where NINJA's SERVER reaches OUR server — must be
	// a real public address (an ngrok tunnel in dev), never localhost.
	// Deliberately separate from PublicURL: that one is what the user's
	// browser uses, this one is what Ninja's backend uses, and conflating
	// them would either break local CORS or silently disable webhooks.
	WebhookPublicURL string
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

// CORS wraps the mux so the Vite dev server (a different origin/port) can
// call this API with cookies attached. Only needed for local development —
// see main.go for how the built frontend is served in "production" mode.
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

const sessionCookieName = "ninjabet_player_id"

func setSessionCookie(w http.ResponseWriter, playerID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    playerID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 7,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func (e *Env) currentPlayer(r *http.Request) *betdb.Player {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil
	}
	p, err := betdb.GetPlayer(e.DB, cookie.Value)
	if err != nil {
		return nil
	}
	return p
}

// ageFromDOB computes whole years between a YYYY-MM-DD date of birth and
// today — mirrors the calculation NLRC §34 compliance hinges on, done
// locally so we don't have to trust a client-supplied age.
func ageFromDOB(dob string) int {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(dob))
	if err != nil {
		return 0
	}
	now := time.Now()
	age := now.Year() - t.Year()
	if now.Month() < t.Month() || (now.Month() == t.Month() && now.Day() < t.Day()) {
		age--
	}
	return age
}

// isValidPhoneNumber matches Nigerian mobile numbers: 11 digits starting
// with 0 (080/081/070/090/...), or +234 followed by 10 digits.
var phoneRe = regexp.MustCompile(`^(0\d{10}|\+234\d{10})$`)

func isValidPhoneNumber(s string) bool { return phoneRe.MatchString(s) }

var idNumberRe = regexp.MustCompile(`^\d{11}$`)

// isValidIDNumber matches BVN/NIN's fixed 11-digit format — the same shape
// Ninja's own sandbox fixture table (77777777777, 66666666666, ...) uses.
func isValidIDNumber(s string) bool { return idNumberRe.MatchString(s) }

// isValidDOB rejects dates that can't be a real date of birth: malformed,
// in the future, or implying an age over 120.
func isValidDOB(s string) bool {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(s))
	if err != nil {
		return false
	}
	if t.After(time.Now()) {
		return false
	}
	if time.Since(t).Hours() > 120*365*24 {
		return false
	}
	return true
}
