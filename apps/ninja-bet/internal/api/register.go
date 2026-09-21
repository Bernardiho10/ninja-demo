package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

type registerRequest struct {
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	PhoneNumber string `json:"phone_number"`
	NIN         string `json:"nin"`
	Password    string `json:"password"`
}

type playerView struct {
	ID           string   `json:"id"`
	FirstName    string   `json:"first_name"`
	LastName     string   `json:"last_name"`
	PhoneNumber  string   `json:"phone_number"`
	KYCStatus    string   `json:"kyc_status"`
	Age          *int64   `json:"age,omitempty"`
	MatchScore   *float64 `json:"match_score,omitempty"`
	PhotoDataURI string   `json:"photo_data_uri,omitempty"`
	SelfExcluded bool     `json:"self_excluded"`
	BalanceKobo  int64    `json:"balance_kobo"`
	WinningsKobo int64    `json:"winnings_kobo"`

	SavedBankName      string `json:"saved_bank_name,omitempty"`
	SavedAccountNumber string `json:"saved_account_number,omitempty"`

	FaceVerificationStatus string   `json:"face_verification_status,omitempty"`
	FaceVerificationURL    string   `json:"face_verification_url,omitempty"`
	FaceScore              *float64 `json:"face_score,omitempty"`

	RequireFaceForPayout bool    `json:"require_face_for_payout"`
	LivenessThreshold    float64 `json:"liveness_threshold"`
	LivenessTier         string  `json:"liveness_tier"` // low | medium | high | custom
}

// livenessTierLabel maps a stored threshold back to the preset label it
// came from — "custom" for anything that doesn't match one of the three
// tiers (shouldn't normally happen, since SaveSecuritySettings only ever
// writes one of the three, but a fixture or manual DB edit could).
func livenessTierLabel(threshold float64) string {
	const epsilon = 0.001
	for tier, t := range securityTiers {
		if threshold > t-epsilon && threshold < t+epsilon {
			return tier
		}
	}
	return "custom"
}

func toPlayerView(p *betdb.Player) playerView {
	v := playerView{
		ID:           p.ID,
		FirstName:    p.FirstName,
		LastName:     p.LastName,
		PhoneNumber:  p.PhoneNumber,
		KYCStatus:    p.KYCStatus,
		SelfExcluded: p.SelfExcluded,
		BalanceKobo:  p.BalanceKobo,
		WinningsKobo: p.WinningsKobo,
	}
	if p.Age.Valid {
		v.Age = &p.Age.Int64
	}
	if p.MatchScore.Valid {
		v.MatchScore = &p.MatchScore.Float64
	}
	if p.PhotoDataURI.Valid {
		v.PhotoDataURI = p.PhotoDataURI.String
	}
	if p.SavedBankName.Valid {
		v.SavedBankName = p.SavedBankName.String
	}
	if p.SavedAccountNumber.Valid {
		v.SavedAccountNumber = p.SavedAccountNumber.String
	}
	if p.FaceVerificationStatus.Valid {
		v.FaceVerificationStatus = p.FaceVerificationStatus.String
	}
	if p.FaceVerificationURL.Valid {
		v.FaceVerificationURL = p.FaceVerificationURL.String
	}
	if p.FaceScore.Valid {
		v.FaceScore = &p.FaceScore.Float64
	}
	v.RequireFaceForPayout = p.RequireFaceForPayout
	v.LivenessThreshold = p.LivenessThreshold
	v.LivenessTier = livenessTierLabel(p.LivenessThreshold)
	return v
}

type registerResponse struct {
	Player       playerView              `json:"player"`
	Message      string                  `json:"message"`
	LookupResult *ninja.IdentifyResponse `json:"lookup_result,omitempty"`
	VerifyResult *ninja.IdentifyResponse `json:"verify_result,omitempty"`
}

// Register is ninja-bet's KYC gate — not a separate step, the gate IS
// registration. Two real calls to POST /api/identity/identify happen here:
//
//  1. mode=lookup, using only the submitted NIN — fetches the registry's
//     name, date of birth, and photo. The player never types a DOB; we get
//     the authoritative one from Ninja.
//  2. mode=verify, using the submitted first/last name against the NIN,
//     with the DOB from step 1 — confirms the person registering actually
//     matches the NIN they supplied (catches a mistyped or borrowed NIN).
//
// See apps/ninja-bet/tutor.md for the full walkthrough with real captured
// responses. POST /api/players/register
func (e *Env) Register(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.PhoneNumber = strings.TrimSpace(req.PhoneNumber)
	req.NIN = strings.TrimSpace(req.NIN)

	if req.FirstName == "" || req.LastName == "" || req.PhoneNumber == "" || req.NIN == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "first_name, last_name, phone_number, nin, and password are required")
		return
	}
	if !isValidPhoneNumber(req.PhoneNumber) {
		writeError(w, http.StatusBadRequest, "phone_number must be a valid Nigerian number, e.g. 08012345678")
		return
	}
	if !isValidIDNumber(req.NIN) {
		writeError(w, http.StatusBadRequest, "nin must be 11 digits")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	existing, err := betdb.GetPlayerByPhone(e.DB, req.PhoneNumber)
	if err != nil {
		log.Printf("check existing player: %v", err)
	}
	if req.PhoneNumber == "08012345678" {
		// For the presenter's default demo account, clean up prior test accounts
		// so registration starts completely fresh with ₦100,000 welcome credit and verified status.
		_, _ = e.DB.Exec("DELETE FROM sessions WHERE player_id IN (SELECT id FROM players WHERE id_number = ? OR phone_number = ?)", req.NIN, req.PhoneNumber)
		_, _ = e.DB.Exec("DELETE FROM bets WHERE player_id IN (SELECT id FROM players WHERE id_number = ? OR phone_number = ?)", req.NIN, req.PhoneNumber)
		_, _ = e.DB.Exec("DELETE FROM payouts WHERE player_id IN (SELECT id FROM players WHERE id_number = ? OR phone_number = ?)", req.NIN, req.PhoneNumber)
		_, _ = e.DB.Exec("DELETE FROM deposits WHERE player_id IN (SELECT id FROM players WHERE id_number = ? OR phone_number = ?)", req.NIN, req.PhoneNumber)
		_, _ = e.DB.Exec("DELETE FROM players WHERE id_number = ? OR phone_number = ?", req.NIN, req.PhoneNumber)
	} else if existing != nil {
		writeError(w, http.StatusConflict, "an account with this phone number already exists — log in instead")
		return
	}

	// Step 1: lookup — resolve the NIN to a registry record. No name or DOB
	// sent yet; the NIN alone is the query.
	lookup, err := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
		IDType:    "nin",
		Mode:      "lookup",
		IDNumber:  req.NIN,
		Reference: "ninjabet_lookup_" + uuid.NewString()[:8],
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "ninja identity lookup failed: "+err.Error())
		return
	}
	lookupRaw, _ := json.Marshal(lookup)

	if lookup.Data == nil {
		writeError(w, http.StatusUnprocessableEntity, "this NIN was not found in the national registry — registration requires a valid NIN")
		return
	}

	// Step 2: verify — does the name the player just typed match the name
	// on file for this NIN? Uses the DOB step 1 returned, not anything the
	// client sent.
	verify, err := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
		IDType:      "nin",
		Mode:        "verify",
		IDNumber:    req.NIN,
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		DateOfBirth: lookup.Data.DateOfBirth,
		Reference:   "ninjabet_verify_" + uuid.NewString()[:8],
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "ninja identity verification failed: "+err.Error())
		return
	}
	verifyRaw, _ := json.Marshal(verify)

	age := ageFromDOB(lookup.Data.DateOfBirth)

	// Bonus-farming defense: this NIN is a real, government-issued fact —
	// it can't be recreated by signing up with a new phone number and
	// email the way a synthetic identity can. If it's already on file,
	// this is the same person opening a second account, not a new
	// customer.
	existingAccounts, err := betdb.CountPlayersByIdentity(e.DB, req.NIN)
	if err != nil {
		log.Printf("count players by identity: %v", err)
	}

	// Step 3: Compare submitted form data directly against the authoritative looked-up NIMC registry data
	lookupFirst := strings.TrimSpace(lookup.Data.FirstName)
	lookupLast := strings.TrimSpace(lookup.Data.LastName)
	nameMatches := strings.EqualFold(req.FirstName, lookupFirst) && strings.EqualFold(req.LastName, lookupLast)

	if !nameMatches || !verify.Verified {
		writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf(
			"Identity Mismatch: You submitted %s %s, but NIN %s belongs to %s %s in the NIMC government registry (DOB: %s). Registration rejected under NLRC & NIMC regulations.",
			req.FirstName, req.LastName, req.NIN, lookupFirst, lookupLast, lookup.Data.DateOfBirth,
		))
		return
	}

	var status, message string
	welcomeBonusKobo := int64(10000000) // ₦100,000
	switch {
	case age < 18:
		status = "blocked_underage"
		welcomeBonusKobo = 0
		message = "NLRC §34: registry date of birth indicates age under 18. Account created but permanently locked from betting and payouts."
	case existingAccounts > 0:
		status = "flagged_duplicate_identity"
		welcomeBonusKobo = 0
		message = fmt.Sprintf(
			"This NIN is already linked to %d other ninja-bet account(s). Your identity is genuine, so the account works normally with your own deposits — but no second ₦100,000 welcome bonus. This is what stops bonus-farming: a new email and phone number is trivial to fake, a NIN isn't.",
			existingAccounts,
		)
	default:
		status = "verified"
		message = "Welcome to ninja-bet, " + req.FirstName + ". Identity confirmed via Ninja in real time — ₦100,000 welcome credit added, betting and payouts are active."
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("hash password: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	playerID := uuid.NewString()
	if err := betdb.CreatePlayer(
		e.DB, playerID, req.FirstName, req.LastName, req.PhoneNumber, string(passwordHash),
		status, req.NIN, lookup.Data.DateOfBirth, age, verify.Score,
		string(lookupRaw), string(verifyRaw), lookup.Data.Image, welcomeBonusKobo,
	); err != nil {
		log.Printf("create player: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	player, _ := betdb.GetPlayer(e.DB, playerID)

	// A blocked registration (underage, or a name that doesn't match the
	// NIN) is recorded — for fraud-signals/audit purposes, same as a
	// duplicate-identity flag — but never logged in. Compliance failing
	// must mean no session, not a restricted one; only an identity that
	// actually cleared the gate gets to be "logged in" at all.
	if player.CanTransact() {
		setSessionCookie(w, playerID)
	}
	writeJSON(w, http.StatusCreated, registerResponse{
		Player:       toPlayerView(player),
		Message:      message,
		LookupResult: lookup,
		VerifyResult: verify,
	})
}

type loginRequest struct {
	PhoneNumber string `json:"phone_number"`
	Password    string `json:"password"`
}

// Login verifies the supplied password against the stored bcrypt hash.
// POST /api/players/login
func (e *Env) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	phone := strings.TrimSpace(req.PhoneNumber)

	player, err := betdb.GetPlayerByPhone(e.DB, phone)
	if err != nil {
		log.Printf("look up player: %v", err)
		writeError(w, http.StatusInternalServerError, "could not log in")
		return
	}
	if player == nil {
		writeError(w, http.StatusUnauthorized, "invalid phone number or password")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(player.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid phone number or password")
		return
	}

	setSessionCookie(w, player.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"player":  toPlayerView(player),
		"message": "Welcome back, " + player.FirstName + ".",
	})
}

// Logout clears the session cookie. No Ninja call, no state change on the
// player record — logging out doesn't undo identity resolution, it just
// ends this browser's session.
// POST /api/players/logout
func (e *Env) Logout(w http.ResponseWriter, r *http.Request) {
	clearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Logged out."})
}

// Me returns the current session's player.
// GET /api/players/me
func (e *Env) Me(w http.ResponseWriter, r *http.Request) {
	p := e.currentPlayer(r)
	if p == nil {
		writeError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	writeJSON(w, http.StatusOK, toPlayerView(p))
}
