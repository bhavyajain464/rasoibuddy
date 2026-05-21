package middleware

import (
	"net/http"
	"strings"
)

// RequireAdmin protects routes with ADMIN_API_KEY (header X-Admin-Key or Authorization: Bearer).
func RequireAdmin(adminAPIKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.TrimSpace(adminAPIKey) == "" {
				http.Error(w, "Admin API is not configured", http.StatusServiceUnavailable)
				return
			}
			provided := strings.TrimSpace(r.Header.Get("X-Admin-Key"))
			if provided == "" {
				auth := r.Header.Get("Authorization")
				if strings.HasPrefix(auth, "Bearer ") {
					provided = strings.TrimSpace(auth[7:])
				}
			}
			if provided == "" || provided != adminAPIKey {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
