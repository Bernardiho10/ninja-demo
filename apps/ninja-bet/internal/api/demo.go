package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	betdb "github.com/bernardoko/ninja-demo/apps/ninja-bet/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

// SimulateUnderageRegistration demonstrates the underage gate without a
// real Ninja call — the live sandbox has no documented fixture for an
// underage identity (confirmed by testing 88888888888, the one non-real
// number this codebase's own mock client uses for that case, against the
// live sandbox: it returns not_found, same as any unregistered number —
// see tutor.md). Every call this makes is logged to api_logs as is_mock so
// the Inspector never shows it as a real sandbox result.
// POST /api/demo/simulate-underage
func (e *Env) SimulateUnderageRegistration(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
		Password    string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.PhoneNumber = strings.TrimSpace(req.PhoneNumber)
	if !isValidPhoneNumber(req.PhoneNumber) {
		writeError(w, http.StatusBadRequest, "phone_number must be a valid Nigerian number")
		return
	}
	if len(req.Password) < 8 {
		req.Password = "password123"
	}

	if existing, _ := betdb.GetPlayerByPhone(e.DB, req.PhoneNumber); existing != nil {
		writeError(w, http.StatusConflict, "an account with this phone number already exists")
		return
	}

	const nin = "88888888888" // this codebase's own synthetic underage fixture — not real
	const dob = "2010-06-15"

	lookup := &ninja.IdentifyResponse{
		Status: "found",
		Data: &ninja.IdentifyData{
			IDNumber: nin, Type: "nin", FirstName: "Tobi", LastName: "Minor",
			DateOfBirth: dob, Gender: "male", AddressState: "Lagos",
		},
	}
	verify := &ninja.IdentifyResponse{
		Found: true, Verified: true, Score: 1, Recommendation: "accept",
		Fields: []ninja.MatchField{
			{Field: "first_name", Score: 1, Match: "exact", Provided: "Tobi"},
			{Field: "last_name", Score: 1, Match: "exact", Provided: "Minor"},
			{Field: "date_of_birth", Score: 1, Match: "exact", Provided: dob},
		},
	}
	lookupRaw, _ := json.Marshal(lookup)
	verifyRaw, _ := json.Marshal(verify)
	_ = betdb.InsertAPILog(e.DB, uuid.NewString(), "/api/identity/identify", "POST", 200, 0,
		`{"idType":"nin","mode":"lookup","idNumber":"`+nin+`"} — SIMULATED, not sent to Ninja`, string(lookupRaw), true)
	_ = betdb.InsertAPILog(e.DB, uuid.NewString(), "/api/identity/identify", "POST", 200, 0,
		`{"idType":"nin","mode":"verify","idNumber":"`+nin+`"} — SIMULATED, not sent to Ninja`, string(verifyRaw), true)

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	playerID := uuid.NewString()
	if err := betdb.CreatePlayer(
		e.DB, playerID, "Tobi", "Minor", req.PhoneNumber, string(passwordHash),
		"blocked_underage", nin, dob, 16, 1.0, string(lookupRaw), string(verifyRaw), "", 0,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	// Never logged in — this is always blocked_underage by construction,
	// and a blocked registration must not get a session. See Register
	// (register.go) for the same rule on the real path.
	player, _ := betdb.GetPlayer(e.DB, playerID)
	writeJSON(w, http.StatusCreated, registerResponse{
		Player:       toPlayerView(player),
		Message:      "Simulated: NLRC §34 violation — registry date of birth indicates age 16. Account created but permanently locked. (No real Ninja call was made — the sandbox has no underage fixture.)",
		LookupResult: lookup,
		VerifyResult: verify,
	})
}
