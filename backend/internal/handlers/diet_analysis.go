package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"kitchenai-backend/internal/services"
)

type dietAnalysisPatchRequest struct {
	EmailEnabled bool `json:"email_enabled"`
}

// GetDietAnalysisSettings returns diet email preferences.
func GetDietAnalysisSettings(svc *services.DietDigestService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		settings, err := svc.GetSettings(r.Context(), userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)
	}
}

// UpdateDietAnalysisSettings toggles nightly diet email (Elite only).
func UpdateDietAnalysisSettings(svc *services.DietDigestService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var req dietAnalysisPatchRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := svc.SetEmailEnabled(r.Context(), userID, req.EmailEnabled); err != nil {
			if strings.Contains(err.Error(), "Elite") {
				http.Error(w, err.Error(), http.StatusPaymentRequired)
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		settings, err := svc.GetSettings(r.Context(), userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)
	}
}

// SendDietDigestTest emails a day's log summary immediately (Elite + enabled).
// Optional query: ?date=YYYY-MM-DD (defaults to yesterday in Asia/Kolkata).
func SendDietDigestTest(svc *services.DietDigestService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		loc, _ := time.LoadLocation("Asia/Kolkata")
		if loc == nil {
			loc = time.UTC
		}
		dateISO := strings.TrimSpace(r.URL.Query().Get("date"))
		if dateISO == "" {
			dateISO = time.Now().In(loc).AddDate(0, 0, -1).Format("2006-01-02")
		} else if _, err := time.Parse("2006-01-02", dateISO); err != nil {
			http.Error(w, "date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		if err := svc.SendDigestForUser(r.Context(), userID, dateISO); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "sent",
			"date":   dateISO,
		})
	}
}
