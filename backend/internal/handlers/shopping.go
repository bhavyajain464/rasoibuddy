package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"kitchenai-backend/internal/dblock"
	kafkalib "kitchenai-backend/internal/kafka"
	"kitchenai-backend/internal/models"
	"kitchenai-backend/internal/services"
	"kitchenai-backend/internal/services/ingredients"
	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/units"

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

func normalizeShoppingReq(req *AddShoppingItemReq) error {
	req.Name, req.Qty, req.Unit = ingredients.NormalizeShoppingLine(req.Name, req.Qty, req.Unit)
	return units.ValidateQty(req.Qty)
}

func GetShoppingItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}
		rows, err := db.Query(`
			SELECT id, name, qty, unit, bought, created_at, bought_at
			FROM shopping_items
			WHERE kitchen_id = $1 AND bought = FALSE
			ORDER BY created_at DESC
		`, kitchen.KitchenID)
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
			item.Unit = units.Normalize(item.Unit)
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}
		var req AddShoppingItemReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if req.Name == "" {
			http.Error(w, "name required", 400)
			return
		}
		if err := normalizeShoppingReq(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if existing, ok := findActiveShoppingItem(db, kitchen.KitchenID, req.Name); ok {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(existing)
			return
		}

		var item ShoppingItem
		err = db.QueryRow(`
			INSERT INTO shopping_items (user_id, kitchen_id, name, qty, unit)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, name, qty, unit, bought, created_at
		`, userID, kitchen.KitchenID, req.Name, req.Qty, req.Unit).Scan(
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}
		var items []AddShoppingItemReq
		if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}

		added := []ShoppingItem{}
		pending := fetchActiveShoppingNames(db, kitchen.KitchenID)
		for i := range items {
			if items[i].Name == "" {
				continue
			}
			if err := normalizeShoppingReq(&items[i]); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			req := items[i]
			if services.ShoppingListHasItem(req.Name, pending) {
				continue
			}
			var item ShoppingItem
			err := db.QueryRow(`
				INSERT INTO shopping_items (user_id, kitchen_id, name, qty, unit)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id, name, qty, unit, bought, created_at
			`, userID, kitchen.KitchenID, req.Name, req.Qty, req.Unit).Scan(
				&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt,
			)
			if err != nil {
				log.Printf("bulk add shopping item error: %v", err)
				continue
			}
			pending = append(pending, req.Name)
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

func UpdateShoppingItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		itemID := mux.Vars(r)["id"]
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		var req AddShoppingItemReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			http.Error(w, "name required", 400)
			return
		}
		if err := normalizeShoppingReq(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if existing, ok := findActiveShoppingItemExcluding(db, kitchen.KitchenID, req.Name, itemID); ok {
			http.Error(w, "item already on shopping list: "+existing.Name, http.StatusConflict)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockShoppingItem(tx, itemID, kitchen.KitchenID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}

		var item ShoppingItem
		err = tx.QueryRow(`
			UPDATE shopping_items
			SET name = $1, qty = $2, unit = $3
			WHERE id = $4 AND kitchen_id = $5 AND bought = FALSE
			RETURNING id, name, qty, unit, bought, created_at, bought_at
		`, req.Name, req.Qty, req.Unit, itemID, kitchen.KitchenID).Scan(
			&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt, &item.BoughtAt,
		)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(item)
	}
}

func ToggleShoppingItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		itemID := mux.Vars(r)["id"]
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockShoppingItem(tx, itemID, kitchen.KitchenID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		var bought bool
		err = tx.QueryRow(`
			SELECT bought FROM shopping_items
			WHERE id = $1 AND kitchen_id = $2
		`, itemID, kitchen.KitchenID).Scan(&bought)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}

		newBought := !bought
		var boughtAt interface{}
		if newBought {
			boughtAt = time.Now()
		}

		_, err = tx.Exec(`UPDATE shopping_items SET bought = $1, bought_at = $2 WHERE id = $3 AND kitchen_id = $4`,
			newBought, boughtAt, itemID, kitchen.KitchenID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := tx.Commit(); err != nil {
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockShoppingItem(tx, itemID, kitchen.KitchenID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", 404)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		if _, err := tx.Exec(`DELETE FROM shopping_items WHERE id = $1 AND kitchen_id = $2`, itemID, kitchen.KitchenID); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.WriteHeader(204)
	}
}

// RemoveFromShoppingList removes kitchen shopping rows that match the given item name.
// Called automatically when items are added to inventory.
func RemoveFromShoppingList(db *sql.DB, kitchenID string, itemName string) {
	if strings.TrimSpace(kitchenID) == "" || strings.TrimSpace(itemName) == "" {
		return
	}
	tx, err := db.Begin()
	if err != nil {
		log.Printf("auto-remove shopping begin %q: %v", itemName, err)
		return
	}
	defer tx.Rollback()

	if err := dblock.LockActiveShoppingByName(tx, kitchenID, itemName); err != nil {
		log.Printf("auto-remove shopping lock %q for kitchen %s: %v", itemName, kitchenID, err)
		return
	}
	if _, err := tx.Exec(`
		DELETE FROM shopping_items
		WHERE kitchen_id = $1 AND LOWER(name) = LOWER($2) AND bought = FALSE
	`, kitchenID, itemName); err != nil {
		log.Printf("auto-remove shopping item %q for kitchen %s: %v", itemName, kitchenID, err)
		return
	}
	if err := tx.Commit(); err != nil {
		log.Printf("auto-remove shopping commit %q: %v", itemName, err)
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		inventory := make([]models.Inventory, 0, len(req.IDs))
		var shelfLifeIDs []string
		purchased := 0

		for _, id := range req.IDs {
			tx, txErr := db.Begin()
			if txErr != nil {
				log.Printf("purchase shopping begin %s: %v", id, txErr)
				continue
			}

			if err := dblock.LockShoppingItem(tx, id, kitchen.KitchenID); err != nil {
				tx.Rollback()
				if err != sql.ErrNoRows {
					log.Printf("purchase shopping lock %s: %v", id, err)
				}
				continue
			}
			var shop ShoppingItem
			err := tx.QueryRow(`
				SELECT id, name, qty, unit
				FROM shopping_items
				WHERE id = $1 AND kitchen_id = $2 AND bought = FALSE
			`, id, kitchen.KitchenID).Scan(&shop.ID, &shop.Name, &shop.Qty, &shop.Unit)
			if err != nil {
				tx.Rollback()
				if err != sql.ErrNoRows {
					log.Printf("purchase shopping load %s: %v", id, err)
				}
				continue
			}

			qty := shop.Qty
			if qty <= 0 {
				qty = 1
			}
			unit := units.Normalize(shop.Unit)

			var itemID string
			var createdAt, updatedAt time.Time
			var dbExpiry sql.NullTime
			err = tx.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, is_manual, user_id, kitchen_id)
				VALUES ($1, $2, $3, TRUE, $4, $5)
				RETURNING item_id, created_at, updated_at, estimated_expiry
			`, shop.Name, qty, unit, userID, kitchen.KitchenID).Scan(&itemID, &createdAt, &updatedAt, &dbExpiry)
			if err != nil {
				tx.Rollback()
				log.Printf("purchase shopping inventory %s: %v", shop.Name, err)
				continue
			}

			_, err = tx.Exec(`DELETE FROM shopping_items WHERE id = $1 AND kitchen_id = $2`, shop.ID, kitchen.KitchenID)
			if err != nil {
				tx.Rollback()
				log.Printf("purchase shopping delete %s: %v", shop.ID, err)
				continue
			}
			if err := tx.Commit(); err != nil {
				log.Printf("purchase shopping commit %s: %v", shop.ID, err)
				continue
			}

			item := models.Inventory{
				ItemID:          itemID,
				CanonicalName:   shop.Name,
				Qty:             qty,
				Unit:            unit,
				FoodGroup:       "other",
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}
		var req shoppingIDsReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if len(req.IDs) == 0 {
			http.Error(w, "ids required", 400)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockShoppingItems(tx, kitchen.KitchenID, req.IDs); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		result, err := tx.Exec(`
			DELETE FROM shopping_items
			WHERE kitchen_id = $1 AND id = ANY($2::uuid[])
		`, kitchen.KitchenID, pq.Array(req.IDs))
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		count, _ := result.RowsAffected()
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

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

func findActiveShoppingItem(db *sql.DB, kitchenID, name string) (ShoppingItem, bool) {
	return findActiveShoppingItemExcluding(db, kitchenID, name, "")
}

func findActiveShoppingItemExcluding(db *sql.DB, kitchenID, name, excludeID string) (ShoppingItem, bool) {
	if strings.TrimSpace(kitchenID) == "" || strings.TrimSpace(name) == "" {
		return ShoppingItem{}, false
	}
	rows, err := db.Query(`
		SELECT id, name, qty, unit, bought, created_at
		FROM shopping_items
		WHERE kitchen_id = $1 AND bought = FALSE
	`, kitchenID)
	if err != nil {
		log.Printf("findActiveShoppingItem: %v", err)
		return ShoppingItem{}, false
	}
	defer rows.Close()
	for rows.Next() {
		var item ShoppingItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt); err != nil {
			continue
		}
		if excludeID != "" && item.ID == excludeID {
			continue
		}
		item.Unit = units.Normalize(item.Unit)
		if ingredients.SameIngredient(name, item.Name) {
			return item, true
		}
	}
	return ShoppingItem{}, false
}

func fetchActiveShoppingNames(db *sql.DB, kitchenID string) []string {
	if strings.TrimSpace(kitchenID) == "" {
		return nil
	}
	rows, err := db.Query(`
		SELECT name FROM shopping_items
		WHERE kitchen_id = $1 AND bought = FALSE
	`, kitchenID)
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

func GetOrderSuggestions(db *sql.DB, mealPlanCache *services.MealPlanCache, cfg *config.Config, cookedLog *services.CookedLogService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		inventory := fetchUserInventory(db, userID)
		invNames := inventoryNames(inventory)

		weekPlan, planErr := LoadKitchenWeekPlanEntry(r.Context(), db, cfg, cookedLog, mealPlanCache, kitchen.KitchenID, userID)
		if planErr != nil {
			log.Printf("order suggestions week plan: %v", planErr)
		}

		suggestIn := services.OrderSuggestInput{
			WeekPlan:     weekPlan,
			Inventory:    invNames,
			ShoppingList: fetchActiveShoppingNames(db, kitchen.KitchenID),
		}

		result, err := services.SuggestOrderItems(suggestIn)
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			log.Printf("order suggestions: %v", err)
			summary := "Couldn't load suggestions right now. Try again in a moment."
			if errors.Is(err, services.ErrOrderSuggestNoPlan) {
				summary = "Open Meals and set up your 7-day plan to get order suggestions."
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockBoughtShoppingItems(tx, kitchen.KitchenID); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		result, err := tx.Exec(`DELETE FROM shopping_items WHERE kitchen_id = $1 AND bought = TRUE`, kitchen.KitchenID)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		count, _ := result.RowsAffected()
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"cleared": count})
	}
}
