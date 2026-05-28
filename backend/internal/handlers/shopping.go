package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	kafkalib "kitchenai-backend/internal/kafka"
	"kitchenai-backend/internal/models"
	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"

	"github.com/gorilla/mux"
	"github.com/lib/pq"
)

type ShoppingItem struct {
	ID        string     `json:"id"`
	UserID    string     `json:"user_id,omitempty"`
	Name      string     `json:"name"`
	Qty       float64    `json:"qty"`
	Unit      string     `json:"unit"`
	Bought    bool       `json:"bought"`
	CreatedAt time.Time  `json:"created_at"`
	BoughtAt  *time.Time `json:"bought_at,omitempty"`
}

type AddShoppingItemReq struct {
	Name string  `json:"name"`
	Qty  float64 `json:"qty"`
	Unit string  `json:"unit"`
}

func GetShoppingItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		rows, err := db.Query(`
			SELECT id, name, qty, unit, bought, created_at, bought_at
			FROM shopping_items
			WHERE user_id = $1 AND bought = FALSE
			ORDER BY created_at DESC
		`, userID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		items := []ShoppingItem{}
		for rows.Next() {
			var item ShoppingItem
			if err := rows.Scan(&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt, &item.BoughtAt); err != nil {
				log.Printf("scan shopping item: %v", err)
				continue
			}
			items = append(items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"items": items,
			"count": len(items),
		})
	}
}

func AddShoppingItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var req AddShoppingItemReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if req.Name == "" {
			http.Error(w, "name required", 400)
			return
		}
		if req.Qty < 0 {
			req.Qty = 0
		}
		if req.Unit == "" {
			req.Unit = "pcs"
		}

		var item ShoppingItem
		err := db.QueryRow(`
			INSERT INTO shopping_items (user_id, name, qty, unit)
			VALUES ($1, $2, $3, $4)
			RETURNING id, name, qty, unit, bought, created_at
		`, userID, req.Name, req.Qty, req.Unit).Scan(
			&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt,
		)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		json.NewEncoder(w).Encode(item)
	}
}

func AddBulkShoppingItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var items []AddShoppingItemReq
		if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}

		added := []ShoppingItem{}
		for _, req := range items {
			if req.Name == "" {
				continue
			}
			if req.Qty < 0 {
				req.Qty = 0
			}
			if req.Unit == "" {
				req.Unit = "pcs"
			}
			var item ShoppingItem
			err := db.QueryRow(`
				INSERT INTO shopping_items (user_id, name, qty, unit)
				VALUES ($1, $2, $3, $4)
				RETURNING id, name, qty, unit, bought, created_at
			`, userID, req.Name, req.Qty, req.Unit).Scan(
				&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt,
			)
			if err != nil {
				log.Printf("bulk add shopping item error: %v", err)
				continue
			}
			added = append(added, item)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"items": added,
			"count": len(added),
		})
	}
}

func ToggleShoppingItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		itemID := mux.Vars(r)["id"]

		var bought bool
		err := db.QueryRow(`SELECT bought FROM shopping_items WHERE id = $1 AND user_id = $2`, itemID, userID).Scan(&bought)
		if err != nil {
			http.Error(w, "not found", 404)
			return
		}

		newBought := !bought
		var boughtAt interface{}
		if newBought {
			boughtAt = time.Now()
		}

		_, err = db.Exec(`UPDATE shopping_items SET bought = $1, bought_at = $2 WHERE id = $3 AND user_id = $4`,
			newBought, boughtAt, itemID, userID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"bought": newBought})
	}
}

func DeleteShoppingItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		itemID := mux.Vars(r)["id"]

		_, err := db.Exec(`DELETE FROM shopping_items WHERE id = $1 AND user_id = $2`, itemID, userID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.WriteHeader(204)
	}
}

// RemoveFromShoppingList removes items from the user's shopping list that match the given item name.
// Called automatically when items are added to inventory.
func RemoveFromShoppingList(db *sql.DB, userID string, itemName string) {
	_, err := db.Exec(`
		DELETE FROM shopping_items
		WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND bought = FALSE
	`, userID, itemName)
	if err != nil {
		log.Printf("auto-remove shopping item %q for user %s: %v", itemName, userID, err)
	}
}

type shoppingIDsReq struct {
	IDs []string `json:"ids"`
}

// PurchaseShoppingItems moves shopping rows into inventory (Kafka shelf-life when no expiry) and deletes them from the list.
func PurchaseShoppingItems(db *sql.DB, producer *kafkalib.Producer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var req shoppingIDsReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if len(req.IDs) == 0 {
			http.Error(w, "ids required", 400)
			return
		}

		inventory := make([]models.Inventory, 0, len(req.IDs))
		var shelfLifeIDs []string
		purchased := 0

		for _, id := range req.IDs {
			var shop ShoppingItem
			err := db.QueryRow(`
				SELECT id, name, qty, unit
				FROM shopping_items
				WHERE id = $1 AND user_id = $2 AND bought = FALSE
			`, id, userID).Scan(&shop.ID, &shop.Name, &shop.Qty, &shop.Unit)
			if err != nil {
				if err != sql.ErrNoRows {
					log.Printf("purchase shopping load %s: %v", id, err)
				}
				continue
			}

			qty := shop.Qty
			if qty <= 0 {
				qty = 1
			}
			unit := shop.Unit
			if unit == "" {
				unit = "pcs"
			}

			var itemID string
			var createdAt, updatedAt time.Time
			var dbExpiry sql.NullTime
			err = db.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, is_manual, user_id)
				VALUES ($1, $2, $3, TRUE, $4)
				RETURNING item_id, created_at, updated_at, estimated_expiry
			`, shop.Name, qty, unit, userID).Scan(&itemID, &createdAt, &updatedAt, &dbExpiry)
			if err != nil {
				log.Printf("purchase shopping inventory %s: %v", shop.Name, err)
				continue
			}

			_, err = db.Exec(`DELETE FROM shopping_items WHERE id = $1 AND user_id = $2`, shop.ID, userID)
			if err != nil {
				log.Printf("purchase shopping delete %s: %v", shop.ID, err)
				continue
			}

			item := models.Inventory{
				ItemID:          itemID,
				CanonicalName:   shop.Name,
				Qty:             qty,
				Unit:            unit,
				EstimatedExpiry: models.NullTime(dbExpiry),
				IsManual:        true,
				CreatedAt:       createdAt,
				UpdatedAt:       updatedAt,
			}
			inventory = append(inventory, item)
			if !dbExpiry.Valid {
				shelfLifeIDs = append(shelfLifeIDs, itemID)
			}
			purchased++
		}

		if len(shelfLifeIDs) > 0 && producer != nil {
			producer.PublishShelfLifeEvent(kafkalib.ShelfLifeEvent{
				ItemIDs: shelfLifeIDs,
				UserID:  userID,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"purchased": purchased,
			"inventory": inventory,
		})
	}
}

func BulkDeleteShoppingItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var req shoppingIDsReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if len(req.IDs) == 0 {
			http.Error(w, "ids required", 400)
			return
		}

		result, err := db.Exec(`
			DELETE FROM shopping_items
			WHERE user_id = $1 AND id = ANY($2::uuid[])
		`, userID, pq.Array(req.IDs))
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		count, _ := result.RowsAffected()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"deleted": count})
	}
}

func parseExcludeQuery(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if s := strings.TrimSpace(part); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func fetchActiveShoppingNames(db *sql.DB, userID string) []string {
	rows, err := db.Query(`
		SELECT name FROM shopping_items
		WHERE user_id = $1 AND bought = FALSE
	`, userID)
	if err != nil {
		log.Printf("fetchActiveShoppingNames: %v", err)
		return nil
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		if n := strings.TrimSpace(name); n != "" {
			names = append(names, n)
		}
	}
	return names
}

func GetOrderSuggestions(db *sql.DB, cfg *config.Config, cookedLog *services.CookedLogService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)

		var eaten []services.CookedLogEntry
		if cookedLog != nil {
			if entries, _, err := cookedLog.ListEatenLast15Days(r.Context(), userID); err == nil {
				eaten = entries
			}
		}

		inventory := fetchUserInventory(db, userID)
		invNames := inventoryNames(inventory)

		suggestIn := services.OrderSuggestInput{
			EatenLog:     eaten,
			Inventory:    invNames,
			ShoppingList: fetchActiveShoppingNames(db, userID),
			ExcludeItems: parseExcludeQuery(r.URL.Query().Get("exclude")),
		}
		if prefs := fetchUserPreferences(db, userID); prefs != nil {
			suggestIn.DietaryTags = prefs.DietaryTags
			suggestIn.Allergies = prefs.Allergies
			suggestIn.Dislikes = prefs.Dislikes
			suggestIn.FavCuisines = prefs.FavCuisines
			suggestIn.Memories = prefs.Memories
		}

		result, err := services.SuggestOrderItems(r.Context(), cfg, suggestIn)
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			log.Printf("order suggestions: %v", err)
			summary := "Couldn't load suggestions right now. Try again in a moment."
			if errors.Is(err, services.ErrOrderSuggestNoMeals) {
				summary = "Log meals you cook often to get personalized order suggestions."
			}
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(services.OrderSuggestResult{
				Items:       []services.OrderSuggestItem{},
				Summary:     summary,
				Source:      "error",
				GeneratedAt: time.Now().UTC().Format(time.RFC3339),
			})
			return
		}

		json.NewEncoder(w).Encode(result)
	}
}

func ClearBoughtItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)

		result, err := db.Exec(`DELETE FROM shopping_items WHERE user_id = $1 AND bought = TRUE`, userID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		count, _ := result.RowsAffected()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"cleared": count})
	}
}
