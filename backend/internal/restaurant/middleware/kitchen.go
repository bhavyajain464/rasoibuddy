package middleware

import (
	"context"
	"net/http"

	"kitchenai-backend/internal/middleware"
	"kitchenai-backend/pkg/contracts"

	"github.com/gorilla/mux"
)

type ctxKey string

const (
	kitchenIDKey ctxKey = "restaurant_kitchen_id"
	kitchenRoleKey ctxKey = "restaurant_kitchen_role"
)

var roleRank = map[string]int{
	contracts.RoleMember:  0,
	contracts.RoleStaff:   1,
	contracts.RoleManager: 2,
	contracts.RoleOwner:   3,
}

// RequireRestaurantKitchen validates path kitchen_id, membership, and kind=restaurant.
func RequireRestaurantKitchen(kitchenSvc contracts.KitchenService, minRole string) func(http.Handler) http.Handler {
	minRank := roleRank[minRole]
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := middleware.GetAuthSession(r)
			if session == nil || session.User == nil {
				http.Error(w, "Authentication required", http.StatusUnauthorized)
				return
			}
			kitchenID := mux.Vars(r)["kitchen_id"]
			if kitchenID == "" {
				http.Error(w, "kitchen_id required", http.StatusBadRequest)
				return
			}

			k, err := kitchenSvc.GetKitchen(r.Context(), kitchenID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if k == nil || k.Kind != contracts.KitchenKindRestaurant {
				http.Error(w, "restaurant kitchen not found", http.StatusNotFound)
				return
			}

			mem, err := kitchenSvc.GetMembership(r.Context(), kitchenID, session.User.UserID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if mem == nil {
				http.Error(w, "not a member of this kitchen", http.StatusForbidden)
				return
			}
			if roleRank[mem.Role] < minRank {
				http.Error(w, "insufficient role", http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), kitchenIDKey, kitchenID)
			ctx = context.WithValue(ctx, kitchenRoleKey, mem.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func KitchenIDFromContext(r *http.Request) string {
	if v, ok := r.Context().Value(kitchenIDKey).(string); ok {
		return v
	}
	return ""
}

func KitchenRoleFromContext(r *http.Request) string {
	if v, ok := r.Context().Value(kitchenRoleKey).(string); ok {
		return v
	}
	return ""
}

func UserIDFromRequest(r *http.Request) string {
	session := middleware.GetAuthSession(r)
	if session != nil && session.User != nil {
		return session.User.UserID
	}
	return ""
}
