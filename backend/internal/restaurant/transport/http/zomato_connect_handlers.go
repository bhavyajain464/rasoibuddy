package http

import (
	"io"
	"net/http"
	"os"
	"strings"

	restmw "kitchenai-backend/internal/restaurant/middleware"
	"kitchenai-backend/internal/restaurant/integrations/zomato"

	"github.com/gorilla/mux"
)

func publicAPIBase(r *http.Request) string {
	if v := strings.TrimSpace(os.Getenv("API_PUBLIC_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if fwd := r.Header.Get("X-Forwarded-Proto"); fwd != "" {
		scheme = strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	return scheme + "://" + r.Host
}

func (h *Handler) zomatoConnectStart(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	session, err := h.zomato.StartConnect(r.Context(), kitchenID, userID, publicAPIBase(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *Handler) zomatoConnectStatus(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	token := mux.Vars(r)["token"]
	kitchenID := restmw.KitchenIDFromContext(r)
	session, ok := h.zomato.GetConnectSession(token)
	if !ok {
		http.Error(w, "connect session expired", http.StatusNotFound)
		return
	}
	if session.KitchenID != kitchenID {
		http.Error(w, "connect session does not match kitchen", http.StatusForbidden)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":         session.Status,
		"error":          session.Error,
		"session_saved":  session.Status == zomato.ConnectStatusConnected(),
		"expires_at":     session.ExpiresAt,
	})
}

func (h *Handler) zomatoConnectComplete(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	token := mux.Vars(r)["token"]
	kitchenID := restmw.KitchenIDFromContext(r)
	raw, err := io.ReadAll(r.Body)
	if err != nil || len(raw) == 0 {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	auth, err := zomato.ParseAuth(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.zomato.CompleteConnectWithCookies(r.Context(), token, kitchenID, auth); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session_saved": true, "status": "connected"})
}

func (h *Handler) RegisterZomatoPublicConnect(r *mux.Router) {
	r.HandleFunc("/public/zomato/connect/{token}", h.zomatoConnectLanding).Methods("GET", "OPTIONS")
	r.HandleFunc("/public/zomato/connect/{token}/status", h.zomatoConnectPublicStatus).Methods("GET", "OPTIONS")
	r.HandleFunc("/public/zomato/connect/{token}/h/{host}/{path:.*}", h.zomatoConnectProxy).Methods(
		"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
	)
}

func (h *Handler) RegisterZomatoConnectFallback(r *mux.Router) {
	r.PathPrefix("/partners/").HandlerFunc(h.zomatoConnectFallback).Methods(
		"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
	)
}

func (h *Handler) zomatoConnectFallback(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.NotFound(w, r)
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	c, err := r.Cookie("zomato_connect_token")
	if err != nil || strings.TrimSpace(c.Value) == "" {
		http.NotFound(w, r)
		return
	}
	h.zomato.ConnectProxy(c.Value, "www.zomato.com", r.URL.Path, w, r)
}

func (h *Handler) zomatoConnectLanding(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	token := mux.Vars(r)["token"]
	session, ok := h.zomato.GetConnectSession(token)
	if !ok {
		http.Error(w, "connect session expired", http.StatusNotFound)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "zomato_connect_token",
		Value:    token,
		Path:     "/",
		MaxAge:   900,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, session.LoginURL, http.StatusFound)
}

func (h *Handler) zomatoConnectPublicStatus(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	token := mux.Vars(r)["token"]
	session, ok := h.zomato.GetConnectSession(token)
	if !ok {
		http.Error(w, "connect session expired", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        session.Status,
		"error":         session.Error,
		"session_saved": session.Status == zomato.ConnectStatusConnected(),
	})
}

func (h *Handler) zomatoConnectProxy(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	vars := mux.Vars(r)
	token := vars["token"]
	host := vars["host"]
	path := vars["path"]
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	h.zomato.ConnectProxy(token, host, path, w, r)
}
