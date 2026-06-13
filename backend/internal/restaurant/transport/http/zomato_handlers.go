package http

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	restmw "kitchenai-backend/internal/restaurant/middleware"
	"kitchenai-backend/internal/restaurant/integrations/zomato"

	"github.com/gorilla/mux"
)

func (h *Handler) RegisterZomatoIngest(r *mux.Router) {
	r.HandleFunc("/restaurant/{kitchen_id}/integrations/zomato/ingest", h.zomatoIngest).Methods("POST", "OPTIONS")
}

func (h *Handler) zomatoStatus(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	kitchenID := restmw.KitchenIDFromContext(r)
	st, err := h.zomato.GetStatus(r.Context(), kitchenID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) zomatoStart(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	var creds zomato.StartCredentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	st, err := h.zomato.StartSync(r.Context(), kitchenID, userID, creds)
	if err != nil {
		partnerOutletID := strings.TrimSpace(creds.PartnerOutletID)
		if partnerOutletID == "" {
			partnerOutletID = strings.TrimSpace(creds.PartnerStoreID)
		}
		if partnerOutletID == "" {
			partnerOutletID = strings.TrimSpace(creds.OutletID)
		}
		_ = h.zomato.MarkSyncError(r.Context(), kitchenID, partnerOutletID, err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) zomatoStop(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	kitchenID := restmw.KitchenIDFromContext(r)
	var body struct {
		PartnerOutletID string `json:"partner_outlet_id"`
		PartnerStoreID  string `json:"partner_store_id"`
		OutletID        string `json:"outlet_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	partnerOutletID := strings.TrimSpace(body.PartnerOutletID)
	if partnerOutletID == "" {
		partnerOutletID = strings.TrimSpace(body.PartnerStoreID)
	}
	if partnerOutletID == "" {
		partnerOutletID = strings.TrimSpace(body.OutletID)
	}
	st, err := h.zomato.StopSync(r.Context(), kitchenID, partnerOutletID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) zomatoImportAuth(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
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
	if err := h.zomato.VerifyAndImportAuth(r.Context(), kitchenID, auth); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session_saved": true})
}

func (h *Handler) zomatoIngest(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	secret := strings.TrimSpace(os.Getenv("ZOMATO_WORKER_SECRET"))
	if secret == "" {
		secret = "kitchenai-zomato-dev-secret"
	}
	if r.Header.Get("X-Zomato-Worker-Secret") != secret {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	kitchenID := mux.Vars(r)["kitchen_id"]
	var body struct {
		ActorUserID string              `json:"actor_user_id"`
		OutletID    string              `json:"outlet_id"`
		Orders      []zomato.IngestOrder `json:"orders"`
		Error       string              `json:"error,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.Error != "" {
		_ = h.zomato.MarkSyncError(r.Context(), kitchenID, body.OutletID, body.Error)
		http.Error(w, body.Error, http.StatusBadRequest)
		return
	}
	actor := strings.TrimSpace(body.ActorUserID)
	if actor == "" {
		http.Error(w, "actor_user_id required", http.StatusBadRequest)
		return
	}
	n, err := h.zomato.IngestOrders(r.Context(), kitchenID, body.OutletID, actor, body.Orders)
	if err != nil {
		_ = h.zomato.MarkSyncError(r.Context(), kitchenID, body.OutletID, err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"imported": n.Imported})
}

func (h *Handler) zomatoSeedMenu(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	var body struct {
		PartnerOutletID string `json:"partner_outlet_id"`
		PartnerStoreID  string `json:"partner_store_id"`
		OutletID        string `json:"outlet_id"`
	}
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
	}
	outletID := strings.TrimSpace(body.PartnerOutletID)
	if outletID == "" {
		outletID = strings.TrimSpace(body.PartnerStoreID)
	}
	if outletID == "" {
		outletID = strings.TrimSpace(body.OutletID)
	}
	if outletID == "" {
		var err error
		outletID, err = h.zomato.PartnerOutletIDForKitchen(r.Context(), kitchenID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	result, err := h.zomato.FetchAndSeedMenu(r.Context(), kitchenID, userID, outletID, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) zomatoImportOrder(w http.ResponseWriter, r *http.Request) {
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	var body struct {
		ExternalOrderID string `json:"external_order_id"`
		OutletID        string `json:"outlet_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	result, err := h.zomato.ImportOrderByExternalID(r.Context(), kitchenID, userID, body.OutletID, body.ExternalOrderID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
