package api

import (
	"net/http"

	fdb "github.com/bernardoko/ninja-demo/apps/ninja-fintech/internal/db"
)

// CallLog powers the "Ninja Call Inspector" page — every real request
// this app has sent to Ninja's sandbox, and exactly what came back.
// GET /api/admin/logs
func (e *Env) CallLog(w http.ResponseWriter, r *http.Request) {
	logs, err := fdb.ListRecentAPILogs(e.DB, 30)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load call log")
		return
	}
	writeJSON(w, http.StatusOK, logs)
}
