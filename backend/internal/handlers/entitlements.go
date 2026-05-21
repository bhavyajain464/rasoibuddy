package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"kitchenai-backend/internal/services"
)

// UpgradeRequiredBody is returned with HTTP 402 when a paid feature is blocked.
type UpgradeRequiredBody struct {
	Error   string `json:"error"`
	Feature string `json:"feature"`
	Message string `json:"message"`
}

func writeUpgradeRequired(w http.ResponseWriter, feature, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusPaymentRequired)
	json.NewEncoder(w).Encode(UpgradeRequiredBody{
		Error:   "upgrade_required",
		Feature: feature,
		Message: message,
	})
}

// GetEntitlements returns the user's plan and feature limits.
func GetEntitlements(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		ent, err := services.GetEntitlements(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ent)
	}
}

func requireBillScan(db *sql.DB, userID string, w http.ResponseWriter) bool {
	ent, err := services.GetEntitlements(db, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return false
	}
	if ok, msg := services.CanBillScan(ent); !ok {
		writeUpgradeRequired(w, "bill_scan", msg)
		return false
	}
	return true
}

func requireMealCategory(db *sql.DB, userID, category string, w http.ResponseWriter) bool {
	ent, err := services.GetEntitlements(db, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return false
	}
	if ok, msg := services.CanUseMealCategory(ent, category); !ok {
		writeUpgradeRequired(w, "meal_category", msg)
		return false
	}
	return true
}
