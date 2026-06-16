package middleware

import (
	"net/http"
	"strings"
)

// RequirePanelAdmin gates routes to allowlisted user emails (session auth).
// Non-admins and unauthenticated callers receive 404 so the panel stays undiscoverable.
func RequirePanelAdmin(allowedEmails []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedEmails))
	for _, email := range allowedEmails {
		email = strings.ToLower(strings.TrimSpace(email))
		if email != "" {
			allowed[email] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(allowed) == 0 {
				http.NotFound(w, r)
				return
			}
			session := GetAuthSession(r)
			if session == nil || session.User == nil {
				http.NotFound(w, r)
				return
			}
			email := strings.ToLower(strings.TrimSpace(session.User.Email))
			if email == "" {
				http.NotFound(w, r)
				return
			}
			if _, ok := allowed[email]; !ok {
				http.NotFound(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// PanelAdminEmail returns the authenticated user's email when present.
func PanelAdminEmail(r *http.Request) string {
	session := GetAuthSession(r)
	if session == nil || session.User == nil {
		return ""
	}
	return strings.TrimSpace(session.User.Email)
}

// IsPanelAdminEmail reports whether email is in the allowlist.
func IsPanelAdminEmail(email string, allowedEmails []string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return false
	}
	for _, allowed := range allowedEmails {
		if email == strings.ToLower(strings.TrimSpace(allowed)) {
			return true
		}
	}
	return false
}

