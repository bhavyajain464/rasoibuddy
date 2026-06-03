package middleware

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"kitchenai-backend/pkg/appversion"
	"kitchenai-backend/pkg/config"
)

const updateRequiredStatus = 426

// MinAppVersion blocks native API clients below configured minimums.
// Legacy apps without X-App-Platform headers are still blocked when they look
// like a mobile client (okhttp / CFNetwork / React Native user agents).
func MinAppVersion(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cfg == nil || !cfg.AppVersionEnforcementEnabled() {
				next.ServeHTTP(w, r)
				return
			}

			path := r.URL.Path
			if strings.HasSuffix(path, "/app/config") {
				next.ServeHTTP(w, r)
				return
			}

			platform := strings.ToLower(strings.TrimSpace(r.Header.Get("X-App-Platform")))
			build := headerInt(r.Header.Get("X-App-Build"))
			version := strings.TrimSpace(r.Header.Get("X-App-Version"))

			if platform == "web" {
				next.ServeHTTP(w, r)
				return
			}

			if platform == "" {
				if !appversion.IsLikelyNativeApp(r.UserAgent()) {
					next.ServeHTTP(w, r)
					return
				}
				platform = appversion.InferPlatform(r.UserAgent())
				if platform == "" {
					writeUpdateRequired(w, cfg)
					return
				}
				build = 0
				version = ""
			}

			if updateRequired(platform, build, version, cfg) {
				writeUpdateRequired(w, cfg)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func updateRequired(platform string, build int, version string, cfg *config.Config) bool {
	switch platform {
	case "android":
		return appversion.BelowMinimum("android", build, version, cfg.MinAndroidVersion, cfg.MinAndroidBuild)
	case "ios":
		return appversion.BelowMinimum("ios", build, version, cfg.MinIOSVersion, cfg.MinIOSBuild)
	default:
		return false
	}
}

func headerInt(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0
	}
	return n
}

func writeUpdateRequired(w http.ResponseWriter, cfg *config.Config) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(updateRequiredStatus)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error":             "update_required",
		"message":           cfg.AppUpdateMessage,
		"play_store_url":    cfg.PlayStoreURL,
		"app_store_url":     cfg.AppStoreURL,
		"min_android_build": cfg.MinAndroidBuild,
		"min_ios_build":     cfg.MinIOSBuild,
	})
}
