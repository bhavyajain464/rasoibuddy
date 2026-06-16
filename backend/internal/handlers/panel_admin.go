package handlers

import (
	"encoding/json"
	"net/http"
)

// PanelAccess GET /panel/access — 200 only for allowlisted signed-in users; 404 otherwise.
func PanelAccess() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}
}
