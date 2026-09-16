package api

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	bdb "github.com/bernardoko/ninja-demo/apps/ninja-bank/internal/db"
	"github.com/bernardoko/ninja-demo/internal/ninja"
)

type createBusinessRequest struct {
	Name     string `json:"name"`
	RCNumber string `json:"rc_number"`
}

type businessView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	RCNumber  string `json:"rc_number"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func toBusinessView(b *bdb.Business) businessView {
	return businessView{ID: b.ID, Name: b.Name, RCNumber: b.RCNumber, Status: b.Status, CreatedAt: b.CreatedAt}
}

// CreateBusiness registers a business locally — no Ninja call here. There's
// no company-registry idType in the sandbox (only nin/bvn/ndl, all
// individual), so a CAC/RC number can't be verified against Ninja directly.
// What CAN be verified is every director behind the business — that
// happens separately, via BulkVerifyDirectors.
// POST /api/businesses
func (e *Env) CreateBusiness(w http.ResponseWriter, r *http.Request) {
	var req createBusinessRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.RCNumber = strings.TrimSpace(req.RCNumber)
	if req.Name == "" || req.RCNumber == "" {
		writeError(w, http.StatusBadRequest, "name and rc_number are required")
		return
	}

	id := uuid.NewString()
	if err := bdb.InsertBusiness(e.DB, id, req.Name, req.RCNumber); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save business")
		return
	}
	business, _ := bdb.GetBusiness(e.DB, id)
	writeJSON(w, http.StatusCreated, toBusinessView(business))
}

// ListBusinesses returns every registered business, most recent first.
// GET /api/businesses
func (e *Env) ListBusinesses(w http.ResponseWriter, r *http.Request) {
	businesses, err := bdb.ListBusinesses(e.DB)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load businesses")
		return
	}
	views := make([]businessView, 0, len(businesses))
	for _, b := range businesses {
		views = append(views, toBusinessView(b))
	}
	writeJSON(w, http.StatusOK, views)
}

type directorInput struct {
	FullName string `json:"full_name"`
	IDNumber string `json:"id_number"`
}

type bulkVerifyDirectorsRequest struct {
	IDType    string          `json:"id_type"`
	Directors []directorInput `json:"directors"`
}

type directorView struct {
	ID                  string `json:"id"`
	FullName            string `json:"full_name"`
	IDType              string `json:"id_type"`
	IDNumber            string `json:"id_number"`
	Found               bool   `json:"found"`
	RegistryFirstName   string `json:"registry_first_name"`
	RegistryLastName    string `json:"registry_last_name"`
	RegistryDateOfBirth string `json:"registry_date_of_birth"`
	Status              string `json:"status"`
	CheckedAt           string `json:"checked_at"`
}

func toDirectorView(d *bdb.Director) directorView {
	return directorView{
		ID: d.ID, FullName: d.FullName, IDType: d.IDType, IDNumber: d.IDNumber, Found: d.Found,
		RegistryFirstName: d.RegistryFirstName.String, RegistryLastName: d.RegistryLastName.String,
		RegistryDateOfBirth: d.RegistryDateOfBirth.String, Status: d.Status, CheckedAt: d.CheckedAt,
	}
}

// nameMatches is local business logic — BulkIdentify returns a registry
// record, not a match verdict (unlike identify(mode=verify), it has no
// submitted name to compare against). A loose token match: does the
// registry's first AND last name each appear somewhere in the submitted
// full name, case-insensitive. Good enough to catch "wrong person
// entirely"; not meant to catch a single-character typo the way Ninja's
// own verify-mode scoring does.
func nameMatches(submitted, registryFirst, registryLast string) bool {
	if registryFirst == "" && registryLast == "" {
		return false
	}
	lower := strings.ToLower(submitted)
	if registryFirst != "" && !strings.Contains(lower, strings.ToLower(registryFirst)) {
		return false
	}
	if registryLast != "" && !strings.Contains(lower, strings.ToLower(registryLast)) {
		return false
	}
	return true
}

// recomputeBusinessStatus is derived, never set directly: pending until at
// least one director has been checked, flagged_review if any director
// didn't resolve to a real matching identity, verified only once every
// director on file has cleared.
func recomputeBusinessStatus(directors []*bdb.Director) string {
	if len(directors) == 0 {
		return "pending"
	}
	for _, d := range directors {
		if d.Status != "verified" {
			return "flagged_review"
		}
	}
	return "verified"
}

// BulkVerifyDirectors is the KYB moment — up to 25 director NINs/BVNs
// checked against the registry in ONE real Ninja call
// (POST /api/identity/bulk-identify), not 25 separate round trips. Each
// result is matched back to the director that submitted it by id_number,
// then compared locally against the submitted name (see nameMatches).
// POST /api/businesses/{id}/directors/bulk-verify
func (e *Env) BulkVerifyDirectors(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	businessID := r.PathValue("id")
	business, err := bdb.GetBusiness(e.DB, businessID)
	if err != nil || business == nil {
		writeError(w, http.StatusNotFound, "business not found")
		return
	}

	var req bulkVerifyDirectorsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.IDType = strings.TrimSpace(req.IDType)
	if req.IDType != "nin" && req.IDType != "bvn" {
		writeError(w, http.StatusBadRequest, "id_type must be nin or bvn")
		return
	}
	if len(req.Directors) == 0 {
		writeError(w, http.StatusBadRequest, "at least one director is required")
		return
	}
	if len(req.Directors) > 25 {
		writeError(w, http.StatusBadRequest, "bulk-identify accepts at most 25 IDs at once")
		return
	}

	idNumbers := make([]string, 0, len(req.Directors))
	for _, d := range req.Directors {
		idNumbers = append(idNumbers, strings.TrimSpace(d.IDNumber))
	}

	result, err := e.Ninja.BulkIdentify(ctx, ninja.BulkIdentifyRequest{
		IDType:    req.IDType,
		IDNumbers: strings.Join(idNumbers, ","),
		Reference: "ninjabank_directors_" + uuid.NewString()[:8],
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "bulk-identify failed: "+err.Error())
		return
	}

	// Match each returned entry back to the director that submitted its
	// id_number. Falls back to positional alignment if an entry's own
	// id_number field is missing (the sandbox's not-found entries have
	// been observed both with and without it echoed back).
	byIDNumber := make(map[string]ninja.BulkIdentifyEntry, len(result.Data))
	for _, entry := range result.Data {
		if entry.IDNumber != "" {
			byIDNumber[entry.IDNumber] = entry
		}
	}

	for i, d := range req.Directors {
		fullName := strings.TrimSpace(d.FullName)
		idNumber := strings.TrimSpace(d.IDNumber)
		entry, ok := byIDNumber[idNumber]
		if !ok && i < len(result.Data) {
			entry = result.Data[i]
		}

		found := entry.Error == "" && (entry.FirstName != "" || entry.LastName != "")
		status := "not_found"
		if found {
			if nameMatches(fullName, entry.FirstName, entry.LastName) {
				status = "verified"
			} else {
				status = "name_mismatch"
			}
		}

		directorID := uuid.NewString()
		if err := bdb.InsertDirector(e.DB, directorID, businessID, fullName, req.IDType, idNumber, found, entry.FirstName, entry.LastName, entry.DateOfBirth, status); err != nil {
			writeError(w, http.StatusInternalServerError, "could not save director result")
			return
		}
	}

	directors, err := bdb.ListDirectorsByBusiness(e.DB, businessID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load directors")
		return
	}
	newStatus := recomputeBusinessStatus(directors)
	if err := bdb.UpdateBusinessStatus(e.DB, businessID, newStatus); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update business status")
		return
	}

	views := make([]directorView, 0, len(directors))
	for _, d := range directors {
		views = append(views, toDirectorView(d))
	}
	business, _ = bdb.GetBusiness(e.DB, businessID)
	writeJSON(w, http.StatusOK, map[string]any{
		"business":  toBusinessView(business),
		"directors": views,
	})
}

// GetBusinessDetail returns a business with its full director list — the
// dashboard's detail-panel view.
// GET /api/businesses/{id}
func (e *Env) GetBusinessDetail(w http.ResponseWriter, r *http.Request) {
	businessID := r.PathValue("id")
	business, err := bdb.GetBusiness(e.DB, businessID)
	if err != nil || business == nil {
		writeError(w, http.StatusNotFound, "business not found")
		return
	}
	directors, err := bdb.ListDirectorsByBusiness(e.DB, businessID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load directors")
		return
	}
	views := make([]directorView, 0, len(directors))
	for _, d := range directors {
		views = append(views, toDirectorView(d))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"business":  toBusinessView(business),
		"directors": views,
	})
}
