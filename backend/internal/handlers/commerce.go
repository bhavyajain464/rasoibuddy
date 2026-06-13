package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"
)

type commercePartnerView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	LogoURL string `json:"logo_url,omitempty"`
	ETA     string `json:"eta,omitempty"`
}

// GetCommercePartners lists enabled grocery-ordering partners for the household shopping
// flow. Returns enabled=false / empty list when COMMERCE_ENABLED is off so the client can
// hide the surface entirely. (Consumer app only — unrelated to the restaurant module.)
func GetCommercePartners(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		enabled := cfg != nil && cfg.Commerce.Enabled
		out := []commercePartnerView{}
		if enabled {
			for _, p := range cfg.Commerce.Partners {
				out = append(out, commercePartnerView{ID: p.ID, Name: p.Name, LogoURL: p.LogoURL, ETA: p.ETA})
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"enabled":  enabled,
			"partners": out,
		})
	}
}

type orderLinkReq struct {
	Partner string                   `json:"partner"`
	Source  string                   `json:"source"`
	Items   []services.OrderLinkItem `json:"items"`
}

// CreateOrderLink builds a deep/affiliate link for a partner from the user's grocery list,
// logs the intent for attribution, and returns the URL + a clipboard-friendly list.
func CreateOrderLink(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if cfg == nil || !cfg.Commerce.Enabled {
			http.Error(w, "online ordering is not available", http.StatusNotFound)
			return
		}
		var req orderLinkReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		partner, ok := cfg.Commerce.FindPartner(req.Partner)
		if !ok {
			http.Error(w, "unknown ordering partner", http.StatusBadRequest)
			return
		}
		var items []services.OrderLinkItem
		for _, it := range req.Items {
			if strings.TrimSpace(it.Name) != "" {
				items = append(items, it)
			}
		}
		if len(items) == 0 {
			http.Error(w, "your list is empty", http.StatusBadRequest)
			return
		}
		source := strings.TrimSpace(req.Source)
		if source == "" {
			source = "shopping_list"
		}

		trackingID := services.NewCommerceTrackingID()
		link, copyText := services.BuildOrderLink(partner, items, trackingID)

		userID := getUserID(r)
		kitchenID := ""
		if k, err := resolveKitchenForUser(db, userID); err == nil && k != nil {
			kitchenID = k.KitchenID
		}
		if err := services.RecordOrderIntent(db, userID, kitchenID, partner.ID, source, trackingID, items); err != nil {
			log.Printf("commerce: record order intent failed (non-fatal): %v", err)
		}

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"partner":     partner.ID,
			"url":         link,
			"tracking_id": trackingID,
			"copy_text":   copyText,
		})
	}
}
