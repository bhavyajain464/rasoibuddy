package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	kafkalib "kitchenai-backend/internal/kafka"
	"kitchenai-backend/internal/middleware"
	"kitchenai-backend/internal/models"
	invgroup "kitchenai-backend/internal/services/inventory"
	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/units"

	"github.com/gorilla/mux"
)

func getUserID(r *http.Request) string {
	if session := middleware.GetAuthSession(r); session != nil && session.User != nil {
		return session.User.UserID
	}
	return ""
}

// expiredRetentionDays is the window for keeping items past their estimated_expiry
// before they get auto-purged. Anything older is deleted opportunistically on read.
const expiredRetentionDays = 7

// purgeMinPeriod throttles per-user purges to once per day. With a 7-day
// retention window this is more than fine — at most ~1 day of stale rows can
// accumulate between purges, and the SELECT queries already filter them out
// of the user's view. The cap means total DELETEs/day ≤ DAU.
const purgeMinPeriod = 24 * time.Hour

// purgeLastRun stores the last time a purge was scheduled for a given user.
// Keyed by user_id, value is time.Time. Stale entries naturally age out as
// users return; we don't bother evicting since the entry size is tiny.
var purgeLastRun sync.Map

// schedulePurgeStaleExpired fires an async purge if one hasn't run for this
// user within purgeMinPeriod. It is safe to call from request handlers — the
// caller is never blocked. The SELECT queries in GetInventory and
// GetExpiredItems already filter stale rows out, so this is housekeeping only.
func schedulePurgeStaleExpired(db *sql.DB, userID string) {
	if userID == "" {
		return
	}
	now := time.Now()
	if prev, loaded := purgeLastRun.LoadOrStore(userID, now); loaded {
		prevTime := prev.(time.Time)
		if now.Sub(prevTime) < purgeMinPeriod {
			return // recent purge — nothing to do
		}
		if !purgeLastRun.CompareAndSwap(userID, prevTime, now) {
			return // another request claimed this slot
		}
	}
	go purgeStaleExpired(db, userID)
}

// purgeStaleExpired deletes inventory items whose estimated_expiry is more than
// `expiredRetentionDays` days in the past for the given user. Errors are logged
// (best-effort) so a failed purge never affects callers.
func purgeStaleExpired(db *sql.DB, userID string) {
	res, err := db.Exec(`
		DELETE FROM inventory
		WHERE estimated_expiry IS NOT NULL
			AND estimated_expiry < CURRENT_DATE - ($1 || ' days')::interval
			AND (user_id = $2 OR user_id IS NULL)
	`, expiredRetentionDays, userID)
	if err != nil {
		log.Printf("inventory: purgeStaleExpired failed for user=%s: %v", userID, err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("inventory: purged %d stale expired item(s) for user=%s", n, userID)
	}
}

type backfillFoodGroupsResponse struct {
	Enriched int      `json:"enriched"`
	ItemIDs  []string `json:"item_ids"`
}

func listInventoryItemIDs(db *sql.DB, userID string) ([]string, error) {
	return listInventoryItemIDsForFoodGroupBackfill(db, userID, "all")
}

// listInventoryItemIDsForFoodGroupBackfill selects item IDs to LLM-classify.
// scope "expired" = expired rows in the retention window missing a real food_group.
func listInventoryItemIDsForFoodGroupBackfill(db *sql.DB, userID, scope string) ([]string, error) {
	scope = strings.ToLower(strings.TrimSpace(scope))
	if scope == "" {
		scope = "all"
	}

	var rows *sql.Rows
	var err error

	switch scope {
	case "expired":
		if userID == "" {
			rows, err = db.Query(`
				SELECT item_id::text FROM inventory
				WHERE estimated_expiry IS NOT NULL
					AND estimated_expiry < CURRENT_DATE
					AND estimated_expiry >= CURRENT_DATE - ($1 || ' days')::interval
					AND COALESCE(NULLIF(TRIM(food_group), ''), 'other') = 'other'
				ORDER BY canonical_name
			`, expiredRetentionDays)
		} else {
			rows, err = db.Query(`
				SELECT item_id::text FROM inventory
				WHERE (user_id = $1 OR user_id IS NULL)
					AND estimated_expiry IS NOT NULL
					AND estimated_expiry < CURRENT_DATE
					AND estimated_expiry >= CURRENT_DATE - ($2 || ' days')::interval
					AND COALESCE(NULLIF(TRIM(food_group), ''), 'other') = 'other'
				ORDER BY canonical_name
			`, userID, expiredRetentionDays)
		}
	case "all":
		if userID == "" {
			rows, err = db.Query(`SELECT item_id::text FROM inventory ORDER BY canonical_name`)
		} else {
			rows, err = db.Query(
				`SELECT item_id::text FROM inventory WHERE user_id = $1 OR user_id IS NULL ORDER BY canonical_name`,
				userID,
			)
		}
	default:
		return nil, fmt.Errorf("invalid scope %q (use all or expired)", scope)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// BackfillInventoryFoodGroups POST — LLM-classifies food_group.
// Optional JSON body: { "scope": "all" | "expired" } (default "all").
// "expired" only targets expired items in the retention window with food_group empty/other.
func BackfillInventoryFoodGroups(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			Scope string `json:"scope"`
		}
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&req)
		}

		ids, err := listInventoryItemIDsForFoodGroupBackfill(db, userID, req.Scope)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(ids) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(backfillFoodGroupsResponse{Enriched: 0, ItemIDs: []string{}})
			return
		}

		log.Printf("[inventory] backfill food_group user=%s scope=%q items=%d", userID, strings.TrimSpace(req.Scope), len(ids))
		n := kafkalib.EnrichItemsByIDs(db, cfg, ids, userID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(backfillFoodGroupsResponse{Enriched: n, ItemIDs: ids})
	}
}

// AdminBackfillInventoryFoodGroups POST /admin/inventory/backfill-food-groups
// Optional JSON body: { "user_id": "...", "scope": "all" | "expired" }.
func AdminBackfillInventoryFoodGroups(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			UserID string `json:"user_id"`
			Scope  string `json:"scope"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		userID := strings.TrimSpace(req.UserID)

		ids, err := listInventoryItemIDsForFoodGroupBackfill(db, userID, req.Scope)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(ids) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(backfillFoodGroupsResponse{Enriched: 0, ItemIDs: []string{}})
			return
		}

		log.Printf("[admin] backfill food_group user_filter=%q scope=%q items=%d", userID, strings.TrimSpace(req.Scope), len(ids))
		n := kafkalib.EnrichItemsByIDs(db, cfg, ids, userID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(backfillFoodGroupsResponse{Enriched: n, ItemIDs: ids})
	}
}

func dietaryTagsForUser(db *sql.DB, userID string) []string {
	prefs, err := services.LoadUserPrefs(db, userID)
	if err != nil || prefs == nil {
		return nil
	}
	return prefs.DietaryTags
}

// GetInventoryFoodGroups returns filter group metadata for the inventory UI.
func GetInventoryFoodGroups(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		tags := dietaryTagsForUser(db, userID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(invgroup.ListFoodGroupsForDietary(tags))
	}
}

func scanInventoryItem(
	rows interface {
		Scan(dest ...interface{}) error
	},
) (models.Inventory, error) {
	var item models.Inventory
	var expiry sql.NullTime
	var foodGroup sql.NullString
	err := rows.Scan(
		&item.ItemID,
		&item.CanonicalName,
		&item.Qty,
		&item.Unit,
		&foodGroup,
		&expiry,
		&item.IsManual,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return item, err
	}
	if foodGroup.Valid && foodGroup.String != "" {
		item.FoodGroup = foodGroup.String
	} else {
		item.FoodGroup = "other"
	}
	item.EstimatedExpiry = models.NullTime(expiry)
	item.Unit = units.Normalize(item.Unit)
	return item, nil
}

// GetInventory returns non-expired inventory items for the authenticated user
func GetInventory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		schedulePurgeStaleExpired(db, userID)
		rows, err := db.Query(`
			SELECT item_id, canonical_name, qty, unit, food_group, estimated_expiry, is_manual, created_at, updated_at
			FROM inventory
			WHERE (user_id = $1 OR user_id IS NULL)
				AND (estimated_expiry IS NULL OR estimated_expiry >= CURRENT_DATE)
			ORDER BY estimated_expiry ASC NULLS LAST, created_at DESC
		`, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		items := make([]models.Inventory, 0)
		for rows.Next() {
			item, err := scanInventoryItem(rows)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			items = append(items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}

// GetInventoryItem returns a single inventory item by ID
func GetInventoryItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		userID := getUserID(r)

		var item models.Inventory
		var expiry sql.NullTime
		var foodGroup sql.NullString
		err := db.QueryRow(`
			SELECT item_id, canonical_name, qty, unit, food_group, estimated_expiry, is_manual, created_at, updated_at
			FROM inventory
			WHERE item_id = $1 AND (user_id = $2 OR user_id IS NULL)
		`, id, userID).Scan(
			&item.ItemID,
			&item.CanonicalName,
			&item.Qty,
			&item.Unit,
			&foodGroup,
			&expiry,
			&item.IsManual,
			&item.CreatedAt,
			&item.UpdatedAt,
		)

		if err == sql.ErrNoRows {
			http.Error(w, "Item not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if foodGroup.Valid && foodGroup.String != "" {
			item.FoodGroup = foodGroup.String
		} else {
			item.FoodGroup = "other"
		}
		item.EstimatedExpiry = models.NullTime(expiry)
		item.Unit = units.Normalize(item.Unit)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(item)
	}
}

// CreateInventoryItem creates a new inventory item
func CreateInventoryItem(db *sql.DB, producer *kafkalib.Producer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var req models.InventoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		req.Unit = units.Normalize(req.Unit)
		if req.CanonicalName == "" || req.Qty <= 0 || req.Unit == "" {
			http.Error(w, "Missing required fields", http.StatusBadRequest)
			return
		}

		var expiry *time.Time
		if req.EstimatedExpiry != "" {
			parsedTime, err := time.Parse("2006-01-02", req.EstimatedExpiry)
			if err != nil {
				http.Error(w, "Invalid date format. Use YYYY-MM-DD", http.StatusBadRequest)
				return
			}
			expiry = &parsedTime
		}

		foodGroup := "other"
		if strings.TrimSpace(req.FoodGroup) != "" {
			foodGroup = invgroup.NormalizeFoodGroupForDietary(req.FoodGroup, dietaryTagsForUser(db, userID))
		}

		var itemID string
		var createdAt, updatedAt time.Time
		var dbExpiry sql.NullTime

		if expiry != nil {
			err := db.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, estimated_expiry, is_manual, user_id, food_group)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING item_id, created_at, updated_at, estimated_expiry
			`, req.CanonicalName, req.Qty, req.Unit, *expiry, req.IsManual, userID, foodGroup).Scan(&itemID, &createdAt, &updatedAt, &dbExpiry)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			err := db.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, is_manual, user_id, food_group)
				VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING item_id, created_at, updated_at, estimated_expiry
			`, req.CanonicalName, req.Qty, req.Unit, req.IsManual, userID, foodGroup).Scan(&itemID, &createdAt, &updatedAt, &dbExpiry)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		item := models.Inventory{
			ItemID:          itemID,
			CanonicalName:   req.CanonicalName,
			Qty:             req.Qty,
			Unit:            req.Unit,
			FoodGroup:       foodGroup,
			EstimatedExpiry: models.NullTime(dbExpiry),
			IsManual:        req.IsManual,
			CreatedAt:       createdAt,
			UpdatedAt:       updatedAt,
		}

		RemoveFromShoppingList(db, userID, req.CanonicalName)

		// Bill scan supplies expiry + food_group; skip Kafka. Otherwise enrich via consumer.
		needsEnrich := strings.TrimSpace(req.FoodGroup) == "" || expiry == nil
		if needsEnrich && producer != nil {
			producer.PublishShelfLifeEvent(kafkalib.ShelfLifeEvent{
				ItemIDs: []string{itemID},
				UserID:  userID,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)
	}
}

// UpdateInventoryItem updates an existing inventory item. If the expiry is
// cleared (sent as empty), it re-publishes a ShelfLifeEvent so the Kafka
// consumer re-estimates shelf life via the LLM, mirroring the create path.
func UpdateInventoryItem(db *sql.DB, producer *kafkalib.Producer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		var req models.InventoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		req.Unit = units.Normalize(req.Unit)
		if req.CanonicalName == "" || req.Qty <= 0 || req.Unit == "" {
			http.Error(w, "Missing required fields", http.StatusBadRequest)
			return
		}

		var expiry *time.Time
		if req.EstimatedExpiry != "" {
			parsedTime, err := time.Parse("2006-01-02", req.EstimatedExpiry)
			if err != nil {
				http.Error(w, "Invalid date format. Use YYYY-MM-DD", http.StatusBadRequest)
				return
			}
			expiry = &parsedTime
		}

		userID := getUserID(r)
		var result sql.Result
		var err error
		if expiry != nil {
			result, err = db.Exec(`
				UPDATE inventory
				SET canonical_name = $1, qty = $2, unit = $3, estimated_expiry = $4, is_manual = $5
				WHERE item_id = $6 AND (user_id = $7 OR user_id IS NULL)
			`, req.CanonicalName, req.Qty, req.Unit, *expiry, req.IsManual, id, userID)
		} else {
			result, err = db.Exec(`
				UPDATE inventory
				SET canonical_name = $1, qty = $2, unit = $3, estimated_expiry = NULL, is_manual = $4
				WHERE item_id = $5 AND (user_id = $6 OR user_id IS NULL)
			`, req.CanonicalName, req.Qty, req.Unit, req.IsManual, id, userID)
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			http.Error(w, "Item not found", http.StatusNotFound)
			return
		}

		// If the expiry was cleared, ask the AI to re-estimate.
		if expiry == nil && producer != nil {
			producer.PublishShelfLifeEvent(kafkalib.ShelfLifeEvent{
				ItemIDs: []string{id},
				UserID:  userID,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Item updated successfully"})
	}
}

// DeleteInventoryItem deletes an inventory item
func DeleteInventoryItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]

		userID := getUserID(r)
		result, err := db.Exec("DELETE FROM inventory WHERE item_id = $1 AND (user_id = $2 OR user_id IS NULL)", id, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			http.Error(w, "Item not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Item deleted successfully"})
	}
}

// ExpireInventoryItem sets an item's expiry to yesterday, moving it to the expired tab
func ExpireInventoryItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		userID := getUserID(r)

		result, err := db.Exec(
			`UPDATE inventory SET estimated_expiry = CURRENT_DATE - INTERVAL '1 day', updated_at = NOW()
			 WHERE item_id = $1 AND (user_id = $2 OR user_id IS NULL)`, id, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			http.Error(w, "Item not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Item marked as expired"})
	}
}

// GetExpiringItems returns non-expired items expiring within 2 days
func GetExpiringItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		rows, err := db.Query(`
			SELECT
				item_id, canonical_name, qty, unit, food_group, estimated_expiry,
				(estimated_expiry - CURRENT_DATE) as days_until_expiry
			FROM inventory
			WHERE estimated_expiry IS NOT NULL
				AND estimated_expiry >= CURRENT_DATE
				AND estimated_expiry <= CURRENT_DATE + INTERVAL '7 days'
				AND (user_id = $1 OR user_id IS NULL)
			ORDER BY estimated_expiry ASC
		`, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		items := make([]models.ExpiringItem, 0)
		for rows.Next() {
			var item models.ExpiringItem
			var foodGroup sql.NullString
			err := rows.Scan(
				&item.ItemID, &item.CanonicalName, &item.Qty, &item.Unit, &foodGroup,
				&item.EstimatedExpiry, &item.DaysUntilExpiry,
			)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			item.Unit = units.Normalize(item.Unit)
			if foodGroup.Valid && foodGroup.String != "" {
				item.FoodGroup = foodGroup.String
			}
			items = append(items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}

// GetExpiredItems returns items that have already expired, limited to a rolling
// `expiredRetentionDays`-day window. Anything older than that is purged on read.
func GetExpiredItems(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		schedulePurgeStaleExpired(db, userID)
		rows, err := db.Query(`
			SELECT
				item_id, canonical_name, qty, unit, food_group, estimated_expiry,
				(CURRENT_DATE - estimated_expiry) as days_since_expiry
			FROM inventory
			WHERE estimated_expiry IS NOT NULL
				AND estimated_expiry < CURRENT_DATE
				AND estimated_expiry >= CURRENT_DATE - ($1 || ' days')::interval
				AND (user_id = $2 OR user_id IS NULL)
			ORDER BY estimated_expiry DESC
		`, expiredRetentionDays, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		items := make([]models.ExpiringItem, 0)
		for rows.Next() {
			var item models.ExpiringItem
			var foodGroup sql.NullString
			err := rows.Scan(
				&item.ItemID, &item.CanonicalName, &item.Qty, &item.Unit, &foodGroup,
				&item.EstimatedExpiry, &item.DaysUntilExpiry,
			)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			item.Unit = units.Normalize(item.Unit)
			if foodGroup.Valid && foodGroup.String != "" {
				item.FoodGroup = foodGroup.String
			}
			items = append(items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}
