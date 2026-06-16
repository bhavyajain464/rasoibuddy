package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/internal/services/catalogdb"
)

// AdminListPairLabelAliases GET /admin/catalog/pair-aliases
func AdminListPairLabelAliases(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		rows, err := catalogdb.ListPairLabelAliases(ctx, db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []catalogdb.PairLabelAliasRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"aliases": rows, "count": len(rows)})
	}
}

// AdminRegisterPairLabelAlias POST /admin/catalog/pair-aliases
// Body: { "label": "tea", "target_kind": "dish", "target_id": "masala-chai" }
func AdminRegisterPairLabelAlias(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Label      string `json:"label"`
			TargetKind string `json:"target_kind"`
			TargetID   string `json:"target_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		if err := catalogdb.RegisterPairLabelAlias(ctx, db, req.Label, catalogdb.PairRefKind(strings.TrimSpace(req.TargetKind)), req.TargetID); err != nil {
			if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "must be") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":          true,
			"label":       strings.TrimSpace(req.Label),
			"target_kind": strings.TrimSpace(req.TargetKind),
			"target_id":   strings.TrimSpace(req.TargetID),
		})
	}
}

// AdminDeletePairLabelAlias DELETE /admin/catalog/pair-aliases?label=tea
func AdminDeletePairLabelAlias(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		label := strings.TrimSpace(r.URL.Query().Get("label"))
		if label == "" {
			http.Error(w, "label query param is required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		deleted, err := catalogdb.DeletePairLabelAlias(ctx, db, label)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !deleted {
			http.Error(w, "alias not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "deleted": label})
	}
}

// AdminUpsertCatalogDish POST /admin/catalog/dishes
func AdminUpsertCatalogDish(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req catalogdb.UpsertDishInput
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
		defer cancel()

		if err := catalogdb.UpsertDish(ctx, db, req); err != nil {
			if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "unregistered") || strings.Contains(err.Error(), "unresolved") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		services.InvalidateDishCatalogCache()

		id := strings.TrimSpace(req.ID)
		if id == "" {
			id = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(req.Name), " ", "-"))
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "id": id})
	}
}
