package http

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	restmw "kitchenai-backend/internal/restaurant/middleware"
	zomatosvc 	"kitchenai-backend/internal/restaurant/integrations/zomato"
	"kitchenai-backend/internal/restaurant/services"
	"kitchenai-backend/internal/restaurant/staff"
	"kitchenai-backend/pkg/contracts"

	"github.com/gorilla/mux"
)

func isMissingRelation(err error, table string) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "does not exist") && strings.Contains(msg, strings.ToLower(table))
}

type Handler struct {
	kitchen    contracts.KitchenService
	inventory  contracts.InventoryService
	menu       *services.MenuService
	orders     *services.OrderService
	shopping   *services.ShoppingService
	billing    *services.BillingService
	analytics  *services.AnalyticsService
	zomato     *zomatosvc.Service
	db         *sql.DB
}

func NewHandler(
	kitchen contracts.KitchenService,
	inventory contracts.InventoryService,
	menu *services.MenuService,
	orders *services.OrderService,
	shopping *services.ShoppingService,
	billing *services.BillingService,
	analytics *services.AnalyticsService,
	zomato *zomatosvc.Service,
	db *sql.DB,
) *Handler {
	return &Handler{
		kitchen: kitchen, inventory: inventory, menu: menu, orders: orders,
		shopping: shopping, billing: billing, analytics: analytics, zomato: zomato, db: db,
	}
}

func (h *Handler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/restaurant/kitchens", h.listMyKitchens).Methods("GET", "OPTIONS")
	r.HandleFunc("/restaurant/kitchen", h.createKitchen).Methods("POST", "OPTIONS")
	r.HandleFunc("/restaurant/join", h.joinKitchen).Methods("POST", "OPTIONS")
	r.HandleFunc("/restaurant/join-by-outlet", h.joinKitchenByOutletID).Methods("POST", "OPTIONS")
	r.HandleFunc("/restaurant/provision-zomato", h.provisionRestaurantWithZomato).Methods("POST", "OPTIONS")
	r.HandleFunc("/restaurant/ingredients", h.listCatalogIngredients).Methods("GET", "OPTIONS")

	k := r.PathPrefix("/restaurant/{kitchen_id}").Subrouter()
	k.Use(restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleStaff))

	k.HandleFunc("/inventory", h.listInventory).Methods("GET", "OPTIONS")
	k.HandleFunc("/inventory", h.addInventory).Methods("POST", "OPTIONS")
	k.HandleFunc("", h.getKitchen).Methods("GET", "OPTIONS")
	k.HandleFunc("/members", h.listMembers).Methods("GET", "OPTIONS")
	k.HandleFunc("/members", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.addMember)).ServeHTTP).Methods("POST", "OPTIONS")
	k.HandleFunc("/members/invite", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.cancelMemberInvite)).ServeHTTP).Methods("DELETE", "OPTIONS")
	k.HandleFunc("/members/{user_id}", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleOwner)(http.HandlerFunc(h.updateMemberRole)).ServeHTTP).Methods("PATCH", "OPTIONS")
	k.HandleFunc("/members/{user_id}", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.removeMember)).ServeHTTP).Methods("DELETE", "OPTIONS")

	k.HandleFunc("/menu", h.listMenu).Methods("GET", "OPTIONS")
	k.HandleFunc("/menu", h.upsertMenu).Methods("POST", "OPTIONS")
	k.HandleFunc("/menu/export", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.exportMenu)).ServeHTTP).Methods("GET", "OPTIONS")
	k.HandleFunc("/menu/import", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.importMenu)).ServeHTTP).Methods("POST", "OPTIONS")
	k.HandleFunc("/menu/seed-catalog", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.seedMenuFromCatalog)).ServeHTTP).Methods("POST", "OPTIONS")
	k.HandleFunc("/menu/{menu_item_id}/ingredients", h.getRecipe).Methods("GET", "OPTIONS")
	k.HandleFunc("/menu/{menu_item_id}/ingredients", h.setRecipe).Methods("PUT", "OPTIONS")

	k.HandleFunc("/shopping", h.listShopping).Methods("GET", "OPTIONS")
	k.HandleFunc("/shopping", h.addShopping).Methods("POST", "OPTIONS")
	k.HandleFunc("/shopping/{item_id}", h.deleteShopping).Methods("DELETE", "OPTIONS")

	k.HandleFunc("/orders", h.listOrders).Methods("GET", "OPTIONS")
	k.HandleFunc("/orders", h.createOrder).Methods("POST", "OPTIONS")
	k.HandleFunc("/orders/{order_id}", h.getOrder).Methods("GET", "OPTIONS")
	k.HandleFunc("/orders/{order_id}/complete", h.completeOrder).Methods("POST", "OPTIONS")
	k.HandleFunc("/orders/{order_id}/process", h.processOrder).Methods("POST", "OPTIONS")
	k.HandleFunc("/orders/{order_id}/void", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.voidOrder)).ServeHTTP).Methods("POST", "OPTIONS")

	k.HandleFunc("/reports/usage", h.usageReport).Methods("GET", "OPTIONS")
	k.HandleFunc("/billing/plan", h.getBillingPlan).Methods("GET", "OPTIONS")
	k.HandleFunc("/billing/plan", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleOwner)(http.HandlerFunc(h.setBillingPlan)).ServeHTTP).Methods("PUT", "OPTIONS")

	k.HandleFunc("/analytics/opt-in", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleOwner)(http.HandlerFunc(h.analyticsOptIn)).ServeHTTP).Methods("POST", "OPTIONS")
	k.HandleFunc("/analytics/opt-out", restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleOwner)(http.HandlerFunc(h.analyticsOptOut)).ServeHTTP).Methods("POST", "OPTIONS")
	k.HandleFunc("/analytics/benchmarks", h.analyticsBenchmarks).Methods("GET", "OPTIONS")

	k.HandleFunc("/integrations/zomato/status", h.zomatoStatus).Methods("GET", "OPTIONS")
	k.HandleFunc("/integrations/zomato/connect/start",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoConnectStart)).ServeHTTP,
	).Methods("POST", "OPTIONS")
	k.HandleFunc("/integrations/zomato/connect/{token}/status", h.zomatoConnectStatus).Methods("GET", "OPTIONS")
	k.HandleFunc("/integrations/zomato/connect/{token}/complete",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoConnectComplete)).ServeHTTP,
	).Methods("POST", "OPTIONS")
	k.HandleFunc("/integrations/zomato/import-auth",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoImportAuth)).ServeHTTP,
	).Methods("POST", "OPTIONS")
	k.HandleFunc("/integrations/zomato/start",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoStart)).ServeHTTP,
	).Methods("POST", "OPTIONS")
	k.HandleFunc("/integrations/zomato/stop",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoStop)).ServeHTTP,
	).Methods("POST", "OPTIONS")
	k.HandleFunc("/integrations/zomato/import-order",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoImportOrder)).ServeHTTP,
	).Methods("POST", "OPTIONS")
	k.HandleFunc("/integrations/zomato/seed-menu",
		restmw.RequireRestaurantKitchen(h.kitchen, contracts.RoleManager)(http.HandlerFunc(h.zomatoSeedMenu)).ServeHTTP,
	).Methods("POST", "OPTIONS")
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *Handler) listMyKitchens(w http.ResponseWriter, r *http.Request) {
	userID := restmw.UserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT km.kitchen_id::text, km.role, k.name
		FROM kitchen_members km
		JOIN kitchens k ON k.kitchen_id = km.kitchen_id
		WHERE km.user_id = $1 AND km.kitchen_kind = 'restaurant'
		ORDER BY km.joined_at
	`, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type view struct {
		KitchenID string `json:"kitchen_id"`
		OutletID  string `json:"outlet_id"`
		Role      string `json:"role"`
		Name      string `json:"name"`
	}
	out := make([]view, 0)
	for rows.Next() {
		var v view
		if err := rows.Scan(&v.KitchenID, &v.Role, &v.Name); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		v.OutletID = v.KitchenID
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) createKitchen(w http.ResponseWriter, r *http.Request) {
	userID := restmw.UserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	k, err := h.kitchen.CreateRestaurantKitchen(r.Context(), userID, req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"kitchen_id":  k.KitchenID,
		"outlet_id":   k.KitchenID,
		"name":        k.Name,
		"invite_code": k.InviteCode,
		"role":        contracts.RoleOwner,
	})
}

func (h *Handler) joinKitchenByOutletID(w http.ResponseWriter, r *http.Request) {
	userID := restmw.UserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		OutletID string `json:"outlet_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	outletID := strings.TrimSpace(req.OutletID)
	if outletID == "" {
		http.Error(w, "outlet_id required", http.StatusBadRequest)
		return
	}
	k, err := h.kitchen.GetKitchen(r.Context(), outletID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if k == nil || k.Kind != contracts.KitchenKindRestaurant {
		http.Error(w, "outlet not found", http.StatusNotFound)
		return
	}
	if existing, _ := h.kitchen.GetMembership(r.Context(), outletID, userID); existing != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"kitchen_id": k.KitchenID,
			"outlet_id":  k.KitchenID,
			"name":       k.Name,
			"role":       existing.Role,
		})
		return
	}
	var userEmail string
	_ = h.db.QueryRowContext(r.Context(), `SELECT LOWER(email) FROM users WHERE user_id = $1`, userID).Scan(&userEmail)
	if blocked, err := staff.IsRevoked(r.Context(), h.db, outletID, userID, userEmail); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if blocked {
		http.Error(w, "You were removed from this outlet. Ask the owner to add you back.", http.StatusForbidden)
		return
	}
	if err := h.kitchen.AddMember(r.Context(), outletID, userID, contracts.RoleStaff); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"kitchen_id": k.KitchenID,
		"outlet_id":  k.KitchenID,
		"name":       k.Name,
		"role":       contracts.RoleStaff,
	})
}

func (h *Handler) provisionRestaurantWithZomato(w http.ResponseWriter, r *http.Request) {
	userID := restmw.UserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.zomato == nil {
		http.Error(w, "zomato integration not configured", http.StatusServiceUnavailable)
		return
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil || len(raw) == 0 {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	var req struct {
		Name               string `json:"name"`
		PartnerOutletID    string `json:"partner_outlet_id"`
		PartnerOutletName  string `json:"partner_outlet_name"`
		PartnerStoreID     string `json:"partner_store_id"`
		OutletID           string `json:"outlet_id"`
		PartnerStoreName   string `json:"partner_store_name"`
		OutletName         string `json:"outlet_name"`
		CookieHeader       string `json:"cookie_header"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	partnerOutletID := strings.TrimSpace(req.PartnerOutletID)
	if partnerOutletID == "" {
		partnerOutletID = strings.TrimSpace(req.PartnerStoreID)
	}
	if partnerOutletID == "" {
		partnerOutletID = strings.TrimSpace(req.OutletID)
	}
	if partnerOutletID == "" {
		http.Error(w, "partner_outlet_id required (partner platform store id)", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.CookieHeader) == "" {
		http.Error(w, "cookie_header required — paste Zomato partner cookies after login", http.StatusBadRequest)
		return
	}
	taken, err := h.zomato.IsOutletRegistered(r.Context(), partnerOutletID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if taken {
		http.Error(w, "this Zomato store is already linked — ask the owner for the KitchenAI outlet ID to join", http.StatusConflict)
		return
	}

	// Phase 1: validate Zomato session + partner store — no kitchen row is created until this passes.
	auth, err := zomatosvc.ParseAuth(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.zomato.ValidateAuthForOutlet(r.Context(), auth, partnerOutletID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Phase 2: create kitchen only after cookie/partner store validation succeeded.
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.TrimSpace(req.PartnerStoreName)
	}
	if name == "" {
		name = strings.TrimSpace(req.OutletName)
	}
	k, err := h.kitchen.CreateRestaurantKitchen(r.Context(), userID, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Phase 3: save validated session + partner worker, then try to start polling.
	partnerOutletName := strings.TrimSpace(req.PartnerOutletName)
	if partnerOutletName == "" {
		partnerOutletName = strings.TrimSpace(req.PartnerStoreName)
	}
	if partnerOutletName == "" {
		partnerOutletName = strings.TrimSpace(req.OutletName)
	}
	if err := h.zomato.SaveProvisionedSession(r.Context(), k.KitchenID, userID, partnerOutletID, partnerOutletName, auth); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	menuResult, menuErr := h.zomato.FetchAndSeedMenu(r.Context(), k.KitchenID, userID, partnerOutletID, auth)
	authRaw, _ := json.Marshal(auth)
	st, syncErr := h.zomato.StartSync(r.Context(), k.KitchenID, userID, zomatosvc.StartCredentials{
		Partner:           "zomato",
		PartnerOutletID:   partnerOutletID,
		PartnerOutletName: partnerOutletName,
		PartnerStoreID:    partnerOutletID,
		PartnerStoreName:  partnerOutletName,
		OutletID:          partnerOutletID,
		OutletName:        partnerOutletName,
		AuthJSON:          authRaw,
		AuthVerified:      true,
	})
	resp := map[string]any{
		"kitchen_id":          k.KitchenID,
		"outlet_id":           k.KitchenID,
		"name":                k.Name,
		"partner_outlet_id":   partnerOutletID,
		"partner_outlet_name": partnerOutletName,
		"partner_store_id":    partnerOutletID,
		"partner_store_name":  partnerOutletName,
		"sync_started":        syncErr == nil,
		"menu_seeded":         menuErr == nil,
	}
	if menuResult != nil {
		resp["menu_seed"] = menuResult
	}
	if menuErr != nil {
		resp["menu_seed_error"] = menuErr.Error()
	}
	if syncErr != nil {
		_ = h.zomato.MarkSyncError(r.Context(), k.KitchenID, partnerOutletID, syncErr.Error())
		if idle, _ := h.zomato.GetStatus(r.Context(), k.KitchenID); idle != nil {
			resp["sync_status"] = idle
		}
		resp["sync_error"] = syncErr.Error()
	} else {
		resp["sync_status"] = st
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) joinKitchen(w http.ResponseWriter, r *http.Request) {
	userID := restmw.UserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		InviteCode string `json:"invite_code"`
		Role       string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.InviteCode))
	var kitchenID string
	err := h.db.QueryRowContext(r.Context(), `
		SELECT kitchen_id::text FROM kitchens WHERE invite_code = $1 AND kind = 'restaurant'
	`, code).Scan(&kitchenID)
	if err == sql.ErrNoRows {
		http.Error(w, "invalid invite code", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	role := req.Role
	if role == "" {
		role = contracts.RoleStaff
	}
	var userEmail string
	_ = h.db.QueryRowContext(r.Context(), `SELECT LOWER(email) FROM users WHERE user_id = $1`, userID).Scan(&userEmail)
	if blocked, err := staff.IsRevoked(r.Context(), h.db, kitchenID, userID, userEmail); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if blocked {
		http.Error(w, "You were removed from this outlet. Ask the owner to add you back.", http.StatusForbidden)
		return
	}
	if err := h.kitchen.AddMember(r.Context(), kitchenID, userID, role); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	k, _ := h.kitchen.GetKitchen(r.Context(), kitchenID)
	writeJSON(w, http.StatusOK, map[string]any{
		"kitchen_id":  k.KitchenID,
		"outlet_id":   k.KitchenID,
		"name":        k.Name,
		"invite_code": k.InviteCode,
		"role":        role,
	})
}

func (h *Handler) listInventory(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	limit := 10
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	lowOnly := r.URL.Query().Get("low") == "true"
	foodGroup := r.URL.Query().Get("food_group")
	if foodGroup == "low" {
		lowOnly = true
		foodGroup = ""
	}
	page, err := services.ListInventoryPage(r.Context(), h.db, kitchenID, services.ListInventoryParams{
		Limit:     limit,
		Cursor:    r.URL.Query().Get("cursor"),
		FoodGroup: foodGroup,
		LowOnly:   lowOnly,
	})
	if err != nil {
		if strings.Contains(err.Error(), "invalid") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (h *Handler) listCatalogIngredients(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	items, err := services.SearchCatalogIngredients(r.Context(), h.db, q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []services.CatalogIngredient{}
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) addInventory(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	if userID == "" {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	var req services.AddInventoryInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	item, err := services.AddInventory(r.Context(), h.db, h.inventory, kitchenID, userID, req)
	if err != nil {
		if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "must be") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handler) getKitchen(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	k, err := h.kitchen.GetKitchen(r.Context(), kitchenID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if k == nil {
		http.Error(w, "outlet not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"kitchen_id":  k.KitchenID,
		"outlet_id":   k.KitchenID,
		"name":        k.Name,
		"invite_code": k.InviteCode,
		"kind":        k.Kind,
	})
}

func (h *Handler) listMembers(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	members, err := h.kitchen.ListMembers(r.Context(), kitchenID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	views := make([]services.KitchenMemberView, 0, len(members))
	for _, m := range members {
		v := services.KitchenMemberView{UserID: m.UserID, Role: m.Role, JoinedAt: m.JoinedAt}
		_ = h.db.QueryRowContext(r.Context(), `SELECT email, name FROM users WHERE user_id = $1`, m.UserID).Scan(&v.Email, &v.Name)
		views = append(views, v)
	}
	pendingRows, err := h.db.QueryContext(r.Context(), `
		SELECT email, role, created_at
		FROM restaurant_staff_invites
		WHERE kitchen_id = $1
		ORDER BY created_at
	`, kitchenID)
	if err != nil {
		if !isMissingRelation(err, "restaurant_staff_invites") {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		defer pendingRows.Close()
		for pendingRows.Next() {
			var v services.KitchenMemberView
			if err := pendingRows.Scan(&v.Email, &v.Role, &v.JoinedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			v.Pending = true
			views = append(views, v)
		}
		if err := pendingRows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, http.StatusOK, views)
}

func (h *Handler) addMember(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	inviterID := restmw.UserIDFromRequest(r)
	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	role := req.Role
	if role == "" {
		role = contracts.RoleStaff
	}

	var userID string
	err := h.db.QueryRowContext(r.Context(), `SELECT user_id::text FROM users WHERE LOWER(email) = $1`, email).Scan(&userID)
	if err == sql.ErrNoRows {
		if err := staff.ClearRevocation(r.Context(), h.db, kitchenID, email); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_, err = h.db.ExecContext(r.Context(), `
			INSERT INTO restaurant_staff_invites (kitchen_id, email, role, invited_by)
			VALUES ($1, $2, $3, NULLIF($4, '')::uuid)
			ON CONFLICT (kitchen_id, email) DO UPDATE SET
				role = EXCLUDED.role,
				invited_by = EXCLUDED.invited_by
		`, kitchenID, email, role, inviterID)
		if err != nil {
			if isMissingRelation(err, "restaurant_staff_invites") {
				http.Error(w, "staff invites not configured — run migration 028_restaurant_staff_invites.sql", http.StatusServiceUnavailable)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"email":   email,
			"role":    role,
			"pending": true,
		})
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := staff.ClearRevocation(r.Context(), h.db, kitchenID, email); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.kitchen.AddMember(r.Context(), kitchenID, userID, role); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_, _ = h.db.ExecContext(r.Context(), `
		DELETE FROM restaurant_staff_invites
		WHERE kitchen_id = $1 AND LOWER(email) = LOWER($2)
	`, kitchenID, email)
	writeJSON(w, http.StatusCreated, map[string]string{"user_id": userID, "role": role, "email": email})
}

func (h *Handler) updateMemberRole(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := mux.Vars(r)["user_id"]
	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := h.kitchen.UpdateMemberRole(r.Context(), kitchenID, userID, req.Role); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"user_id": userID, "role": req.Role})
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := mux.Vars(r)["user_id"]
	revokedBy := restmw.UserIDFromRequest(r)
	if err := staff.RemoveMember(r.Context(), h.db, kitchenID, userID, revokedBy); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "removed"})
}

func (h *Handler) cancelMemberInvite(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	if err := staff.CancelInvite(r.Context(), h.db, kitchenID, email); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "invite cancelled"})
}

func (h *Handler) listMenu(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	activeOnly := r.URL.Query().Get("active") == "true"
	limit := 10
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	includeIngredients := r.URL.Query().Get("include") == "ingredients"
	page, err := h.menu.ListMenuPage(r.Context(), kitchenID, services.ListMenuParams{
		Limit:              limit,
		Cursor:             r.URL.Query().Get("cursor"),
		Category:           r.URL.Query().Get("category"),
		ActiveOnly:         activeOnly,
		IncludeIngredients: includeIngredients,
	})
	if err != nil {
		if strings.Contains(err.Error(), "invalid") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (h *Handler) upsertMenu(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	var item services.MenuItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if !item.IsActive && item.MenuItemID == "" {
		item.IsActive = true
	}
	out, err := h.menu.UpsertMenuItem(r.Context(), kitchenID, item)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) exportMenu(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	raw, _, err := h.menu.ExportMenuCSV(r.Context(), kitchenID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="menu-%s.csv"`, kitchenID))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(raw)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

func (h *Handler) importMenu(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	raw, err := decodeMenuImportFile(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	out, err := h.menu.ImportMenuCSV(r.Context(), kitchenID, raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func decodeMenuImportFile(r *http.Request) ([]byte, error) {
	const maxUpload = 32 << 20
	ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxUpload); err != nil {
			return nil, fmt.Errorf("invalid multipart form")
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			file, _, err = r.FormFile("menu")
		}
		if err != nil {
			return nil, fmt.Errorf("file field required")
		}
		defer file.Close()
		raw, err := io.ReadAll(io.LimitReader(file, maxUpload))
		if err != nil {
			return nil, fmt.Errorf("read upload")
		}
		return raw, nil
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxUpload))
	if err != nil {
		return nil, fmt.Errorf("read body")
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("menu file required")
	}
	return raw, nil
}

func (h *Handler) getRecipe(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	menuItemID := mux.Vars(r)["menu_item_id"]
	ings, err := h.menu.GetRecipeIngredients(r.Context(), kitchenID, menuItemID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, ings)
}

func (h *Handler) setRecipe(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	menuItemID := mux.Vars(r)["menu_item_id"]
	var ings []services.RecipeIngredient
	if err := json.NewDecoder(r.Body).Decode(&ings); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	out, err := h.menu.SetRecipeIngredients(r.Context(), kitchenID, menuItemID, ings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) seedMenuFromCatalog(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	var req struct {
		IDs []string `json:"ids"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
	}
	out, err := h.menu.SeedFromCatalog(r.Context(), kitchenID, req.IDs, h.inventory)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) listShopping(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	items, err := h.shopping.List(r.Context(), kitchenID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
		"count": len(items),
	})
}

func (h *Handler) addShopping(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	var req struct {
		Name string  `json:"name"`
		Qty  float64 `json:"qty"`
		Unit string  `json:"unit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	item, err := h.shopping.Add(r.Context(), kitchenID, userID, req.Name, req.Qty, req.Unit)
	if err != nil {
		if strings.Contains(err.Error(), "catalog") || strings.Contains(err.Error(), "required") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handler) deleteShopping(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	itemID := mux.Vars(r)["item_id"]
	if err := h.shopping.Delete(r.Context(), kitchenID, itemID); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *Handler) listOrders(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	limit := 10
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	page, err := h.orders.ListOrders(r.Context(), kitchenID, services.ListOrdersParams{
		Limit:  limit,
		Cursor: r.URL.Query().Get("cursor"),
		Status: r.URL.Query().Get("status"),
	})
	if err != nil {
		if strings.Contains(err.Error(), "invalid") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (h *Handler) createOrder(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	var in services.CreateOrderInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	order, err := h.orders.CreateOrder(r.Context(), kitchenID, userID, in)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusCreated, order)
}

func (h *Handler) getOrder(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	orderID := mux.Vars(r)["order_id"]
	order, err := h.orders.GetOrder(r.Context(), kitchenID, orderID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if order == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, order)
}

func (h *Handler) completeOrder(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	orderID := mux.Vars(r)["order_id"]
	order, err := h.orders.CompleteOrder(r.Context(), kitchenID, orderID, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, order)
}

func (h *Handler) processOrder(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	orderID := mux.Vars(r)["order_id"]
	order, err := h.orders.ProcessOrderInventory(r.Context(), kitchenID, orderID, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, order)
}

func (h *Handler) voidOrder(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	orderID := mux.Vars(r)["order_id"]
	order, err := h.orders.VoidOrder(r.Context(), kitchenID, orderID, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, order)
}

func (h *Handler) usageReport(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	to := time.Now()
	from := to.AddDate(0, 0, -30)
	rows, err := h.orders.UsageReport(r.Context(), kitchenID, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *Handler) getBillingPlan(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	plan, err := h.billing.GetPlan(r.Context(), kitchenID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (h *Handler) setBillingPlan(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	var req struct {
		PlanTier string `json:"plan_tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	plan, err := h.billing.SetPlan(r.Context(), kitchenID, req.PlanTier)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (h *Handler) analyticsOptIn(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	userID := restmw.UserIDFromRequest(r)
	if err := h.analytics.OptIn(r.Context(), kitchenID, userID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "opted_in"})
}

func (h *Handler) analyticsOptOut(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	if err := h.analytics.OptOut(r.Context(), kitchenID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "opted_out"})
}

func (h *Handler) analyticsBenchmarks(w http.ResponseWriter, r *http.Request) {
	kitchenID := restmw.KitchenIDFromContext(r)
	plan, err := h.billing.GetPlan(r.Context(), kitchenID)
	if err != nil || !h.billing.HasFeature(plan, "intelligence") {
		http.Error(w, "intelligence tier required", http.StatusForbidden)
		return
	}
	opted, _ := h.analytics.IsOptedIn(r.Context(), kitchenID)
	if !opted {
		http.Error(w, "opt in to intelligence program first", http.StatusForbidden)
		return
	}
	group := r.URL.Query().Get("food_group")
	if group == "" {
		group = "vegetables"
	}
	data, err := h.analytics.Benchmarks(r.Context(), group)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, data)
}
