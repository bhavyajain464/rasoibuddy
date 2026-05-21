package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"kitchenai-backend/internal/services"
)

// CancelSubscriptionRequest is the admin body to revoke a user's subscription.
type CancelSubscriptionRequest struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Reason string `json:"reason,omitempty"`
}

// CancelSubscription admin handler — immediately sets plan to free.
func CancelSubscription(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CancelSubscriptionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		userID, err := services.ResolveUserID(db, req.UserID, req.Email)
		if err != nil {
			writeAdminError(w, err)
			return
		}

		result, err := services.CancelSubscription(db, userID)
		if err != nil {
			writeAdminError(w, err)
			return
		}

		if reason := strings.TrimSpace(req.Reason); reason != "" {
			log.Printf("[admin] subscription cancelled user=%s email=%s prev_tier=%s reason=%q",
				result.UserID, result.Email, result.PreviousTier, reason)
		} else {
			log.Printf("[admin] subscription cancelled user=%s email=%s prev_tier=%s",
				result.UserID, result.Email, result.PreviousTier)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func writeAdminError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, services.ErrAdminUserNotFound):
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "user_not_found", "message": err.Error()})
	case errors.Is(err, services.ErrSubscriptionNotActive):
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "not_subscribed", "message": err.Error()})
	case errors.Is(err, services.ErrAdminUserIDRequired):
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "bad_request", "message": err.Error()})
	default:
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "internal_error", "message": err.Error()})
	}
}
