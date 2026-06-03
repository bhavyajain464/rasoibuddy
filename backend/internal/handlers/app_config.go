package handlers

import (
	"encoding/json"
	"net/http"

	"kitchenai-backend/pkg/config"
)

// GetAppConfig returns minimum supported app versions for force-update checks (public, no auth).
// Set MIN_ANDROID_BUILD / MIN_IOS_BUILD on the server when you ship a new store build.
// Clients with a lower native build number are blocked until they update.
func GetAppConfig(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"min_android_version": cfg.MinAndroidVersion,
			"min_ios_version":     cfg.MinIOSVersion,
			"min_android_build":   cfg.MinAndroidBuild,
			"min_ios_build":       cfg.MinIOSBuild,
			"update_message":      cfg.AppUpdateMessage,
			"play_store_url":      cfg.PlayStoreURL,
			"app_store_url":       cfg.AppStoreURL,
		})
	}
}
