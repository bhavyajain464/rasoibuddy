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

	"kitchenai-backend/internal/dblock"
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

// lockAndLoadInventoryItemForUpdate blocks other writers on this row until commit, and returns the latest row.
func lockAndLoadInventoryItemForUpdate(tx *sql.Tx, itemID, kitchenID string) (models.Inventory, error) {
	if err := dblock.LockInventoryItem(tx, itemID, kitchenID); err != nil {
		return models.Inventory{}, err
	}
	var item models.Inventory
	var expiry sql.NullTime
	var foodGroup sql.NullString
	err := tx.QueryRow(`
		SELECT item_id, canonical_name, qty, unit, food_group, estimated_expiry, is_manual, created_at, updated_at
		FROM inventory
		WHERE item_id = $1 AND kitchen_id = $2
	`, itemID, kitchenID).Scan(
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

// mergeInventoryPatch applies only set patch fields onto the locked row (other fields stay as-is).
func mergeInventoryPatch(current models.Inventory, patch models.InventoryPatchRequest) (models.Inventory, *time.Time, bool, error) {
	merged := current
	var expiry *time.Time
	clearExpiry := false

	if patch.CanonicalName != nil {
		name := strings.TrimSpace(*patch.CanonicalName)
		if name == "" {
			return merged, nil, false, fmt.Errorf("canonical_name required")
		}
		merged.CanonicalName = name
	}
	if patch.Qty != nil {
		if *patch.Qty <= 0 {
			return merged, nil, false, fmt.Errorf("qty must be positive")
		}
		merged.Qty = *patch.Qty
	}
	if patch.Unit != nil {
		u := units.Normalize(*patch.Unit)
		if u == "" {
			return merged, nil, false, fmt.Errorf("unit required")
		}
		merged.Unit = u
	}
	if patch.EstimatedExpiry != nil {
		raw := strings.TrimSpace(*patch.EstimatedExpiry)
		if raw == "" {
			clearExpiry = true
			merged.EstimatedExpiry = nil
		} else {
			t, err := time.Parse("2006-01-02", raw)
			if err != nil {
				return merged, nil, false, fmt.Errorf("invalid estimated_expiry")
			}
			expiry = &t
			merged.EstimatedExpiry = &t
		}
	}
	if patch.IsManual != nil {
		merged.IsManual = *patch.IsManual
	}

	if strings.TrimSpace(merged.CanonicalName) == "" || merged.Qty <= 0 || merged.Unit == "" {
		return merged, nil, false, fmt.Errorf("invalid merged inventory row")
	}
	return merged, expiry, clearExpiry, nil
}

// expiredRetentionDays is the window for keeping items past their estimated_expiry
// before they get auto-purged. Anything older is deleted opportunistically on read.
const expiredRetentionDays = 7

// expiringSoonDays is the inclusive window (from today) for the expiring bucket.
const expiringSoonDays = 7

// purgeMinPeriod throttles per-kitchen purges to once per day. With a 7-day
// retention window this is more than fine — at most ~1 day of stale rows can
// accumulate between purges, and the SELECT queries already filter them out
// of the user's view. The cap means total DELETEs/day ≤ DAU.
const purgeMinPeriod = 24 * time.Hour

// purgeLastRun stores the last time a purge was scheduled for a given kitchen.
// Keyed by kitchen_id, value is time.Time.
var purgeLastRun sync.Map

// schedulePurgeStaleExpired fires an async purge if one hasn't run for this
// kitchen within purgeMinPeriod. It is safe to call from request handlers — the
// caller is never blocked. The SELECT queries in GetInventory and
// GetExpiredItems already filter stale rows out, so this is housekeeping only.
func schedulePurgeStaleExpired(db *sql.DB, kitchenID string) {
	if kitchenID == "" {
		return
	}
	now := time.Now()
	if prev, loaded := purgeLastRun.LoadOrStore(kitchenID, now); loaded {
		prevTime := prev.(time.Time)
		if now.Sub(prevTime) < purgeMinPeriod {
			return // recent purge — nothing to do
		}
		if !purgeLastRun.CompareAndSwap(kitchenID, prevTime, now) {
			return // another request claimed this slot
		}
	}
	go purgeStaleExpired(db, kitchenID)
}

// purgeStaleExpired deletes inventory items whose estimated_expiry is more than
// `expiredRetentionDays` days in the past for the given kitchen. Errors are logged
// (best-effort) so a failed purge never affects callers.
func purgeStaleExpired(db *sql.DB, kitchenID string) {
	res, err := db.Exec(`
		DELETE FROM inventory
		WHERE estimated_expiry IS NOT NULL
			AND estimated_expiry < CURRENT_DATE - ($1 || ' days')::interval
			AND kitchen_id = $2
	`, expiredRetentionDays, kitchenID)
	if err != nil {
		log.Printf("inventory: purgeStaleExpired failed for kitchen=%s: %v", kitchenID, err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("inventory: purged %d stale expired item(s) for kitchen=%s", n, kitchenID)
	}
}

type backfillFoodGroupsResponse struct {
	Enriched int      `json:"enriched"`
	ItemIDs  []string `json:"item_ids"`
}

func listInventoryItemIDs(db *sql.DB, kitchenID string) ([]string, error) {
	return listInventoryItemIDsForFoodGroupBackfill(db, kitchenID, "all")
}

// listInventoryItemIDsForFoodGroupBackfill selects item IDs to LLM-classify.
// scope "expired" = expired rows in the retention window missing a real food_group.
func listInventoryItemIDsForFoodGroupBackfill(db *sql.DB, kitchenID, scope string) ([]string, error) {
	scope = strings.ToLower(strings.TrimSpace(scope))
	if scope == "" {
		scope = "all"
	}

	var rows *sql.Rows
	var err error

	switch scope {
	case "expired":
		if kitchenID == "" {
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
				WHERE kitchen_id = $1
					AND estimated_expiry IS NOT NULL
					AND estimated_expiry < CURRENT_DATE
					AND estimated_expiry >= CURRENT_DATE - ($2 || ' days')::interval
					AND COALESCE(NULLIF(TRIM(food_group), ''), 'other') = 'other'
				ORDER BY canonical_name
			`, kitchenID, expiredRetentionDays)
		}
	case "all":
		if kitchenID == "" {
			rows, err = db.Query(`SELECT item_id::text FROM inventory ORDER BY canonical_name`)
		} else {
			rows, err = db.Query(
				`SELECT item_id::text FROM inventory WHERE kitchen_id = $1 ORDER BY canonical_name`,
				kitchenID,
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		var req struct {
			Scope string `json:"scope"`
		}
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&req)
		}

		ids, err := listInventoryItemIDsForFoodGroupBackfill(db, kitchen.KitchenID, req.Scope)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(ids) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(backfillFoodGroupsResponse{Enriched: 0, ItemIDs: []string{}})
			return
		}

		log.Printf("[inventory] backfill food_group user=%s kitchen=%s scope=%q items=%d", userID, kitchen.KitchenID, strings.TrimSpace(req.Scope), len(ids))
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
		kitchenID := ""
		if userID != "" {
			k, err := resolveKitchenForUser(db, userID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if k == nil {
				http.Error(w, "kitchen not found for user", http.StatusNotFound)
				return
			}
			kitchenID = k.KitchenID
		}

		ids, err := listInventoryItemIDsForFoodGroupBackfill(db, kitchenID, req.Scope)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(ids) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(backfillFoodGroupsResponse{Enriched: 0, ItemIDs: []string{}})
			return
		}

		log.Printf("[admin] backfill food_group user_filter=%q kitchen_filter=%q scope=%q items=%d", userID, kitchenID, strings.TrimSpace(req.Scope), len(ids))
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

// GetInventory returns disjoint inventory buckets. Query ?include=active,expiring,expired
// (defaults to all three). Counts always reflect the full kitchen snapshot.
func GetInventory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			userName := ""
			if session := middleware.GetAuthSession(r); session != nil && session.User != nil {
				userName = session.User.Name
			}
			kitchen, err = EnsureKitchenForUser(db, userID, userName)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}

		wantActive, wantExpiring, wantExpired, ok := parseInventoryInclude(r.URL.Query().Get("include"))
		if !ok {
			http.Error(w, "invalid include: use active, expiring, expired", http.StatusBadRequest)
			return
		}
		if !wantActive && !wantExpiring && !wantExpired {
			http.Error(w, "include must list at least one bucket", http.StatusBadRequest)
			return
		}

		if wantActive || wantExpired {
			schedulePurgeStaleExpired(db, kitchen.KitchenID)
		}

		resp, err := loadInventoryBuckets(db, kitchen.KitchenID, wantActive, wantExpiring, wantExpired)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func parseInventoryInclude(raw string) (active, expiring, expired, ok bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return true, true, true, true
	}
	ok = true
	for _, part := range strings.Split(raw, ",") {
		switch strings.ToLower(strings.TrimSpace(part)) {
		case "active":
			active = true
		case "expiring":
			expiring = true
		case "expired":
			expired = true
		case "":
			continue
		default:
			return false, false, false, false
		}
	}
	return active, expiring, expired, true
}

func loadInventoryBuckets(db *sql.DB, kitchenID string, wantActive, wantExpiring, wantExpired bool) (models.InventoryBucketsResponse, error) {
	var resp models.InventoryBucketsResponse

	if err := queryInventoryBucketCounts(db, kitchenID, &resp.Counts); err != nil {
		return resp, err
	}

	if wantActive {
		items, err := queryActiveInventory(db, kitchenID)
		if err != nil {
			return resp, err
		}
		resp.Active = items
	}
	if wantExpiring {
		items, err := queryExpiringInventory(db, kitchenID)
		if err != nil {
			return resp, err
		}
		resp.Expiring = items
	}
	if wantExpired {
		items, err := queryExpiredInventory(db, kitchenID)
		if err != nil {
			return resp, err
		}
		resp.Expired = items
	}

	return resp, nil
}

func queryInventoryBucketCounts(db *sql.DB, kitchenID string, counts *models.InventoryBucketCounts) error {
	err := db.QueryRow(`
		SELECT
			COUNT(*) FILTER (
				WHERE estimated_expiry IS NULL
					OR estimated_expiry > CURRENT_DATE + $2::int
			) AS active,
			COUNT(*) FILTER (
				WHERE estimated_expiry IS NOT NULL
					AND estimated_expiry >= CURRENT_DATE
					AND estimated_expiry <= CURRENT_DATE + $2::int
			) AS expiring,
			COUNT(*) FILTER (
				WHERE estimated_expiry IS NOT NULL
					AND estimated_expiry < CURRENT_DATE
					AND estimated_expiry >= CURRENT_DATE - $1::int
			) AS expired
		FROM inventory
		WHERE kitchen_id = $3
	`, expiredRetentionDays, expiringSoonDays, kitchenID).Scan(&counts.Active, &counts.Expiring, &counts.Expired)
	if err != nil {
		return err
	}
	counts.Total = counts.Active + counts.Expiring + counts.Expired
	return nil
}

func queryActiveInventory(db *sql.DB, kitchenID string) ([]models.Inventory, error) {
	rows, err := db.Query(`
		SELECT item_id, canonical_name, qty, unit, food_group, estimated_expiry, is_manual, created_at, updated_at
		FROM inventory
		WHERE kitchen_id = $1
			AND (
				estimated_expiry IS NULL
				OR estimated_expiry > CURRENT_DATE + $2::int
			)
		ORDER BY estimated_expiry ASC NULLS LAST, created_at DESC
	`, kitchenID, expiringSoonDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Inventory, 0)
	for rows.Next() {
		item, err := scanInventoryItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func queryExpiringInventory(db *sql.DB, kitchenID string) ([]models.ExpiringItem, error) {
	rows, err := db.Query(`
		SELECT
			item_id, canonical_name, qty, unit, food_group, estimated_expiry,
			(estimated_expiry - CURRENT_DATE)::int as days_until_expiry,
			updated_at
		FROM inventory
		WHERE estimated_expiry IS NOT NULL
			AND estimated_expiry >= CURRENT_DATE
			AND estimated_expiry <= CURRENT_DATE + $2::int
			AND kitchen_id = $1
		ORDER BY estimated_expiry ASC
	`, kitchenID, expiringSoonDays)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanExpiringRows(rows)
}

func queryExpiredInventory(db *sql.DB, kitchenID string) ([]models.ExpiringItem, error) {
	rows, err := db.Query(`
		SELECT
			item_id, canonical_name, qty, unit, food_group, estimated_expiry,
			(estimated_expiry - CURRENT_DATE)::int as days_until_expiry,
			updated_at
		FROM inventory
		WHERE estimated_expiry IS NOT NULL
			AND estimated_expiry < CURRENT_DATE
			AND estimated_expiry >= CURRENT_DATE - $1::int
			AND kitchen_id = $2
		ORDER BY estimated_expiry DESC
	`, expiredRetentionDays, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanExpiringRows(rows)
}

func scanExpiringRows(rows *sql.Rows) ([]models.ExpiringItem, error) {
	items := make([]models.ExpiringItem, 0)
	for rows.Next() {
		var item models.ExpiringItem
		var foodGroup sql.NullString
		var updatedAt sql.NullTime
		err := rows.Scan(
			&item.ItemID, &item.CanonicalName, &item.Qty, &item.Unit, &foodGroup,
			&item.EstimatedExpiry, &item.DaysUntilExpiry, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		item.Unit = units.Normalize(item.Unit)
		if foodGroup.Valid && foodGroup.String != "" {
			item.FoodGroup = foodGroup.String
		}
		if updatedAt.Valid {
			item.UpdatedAt = updatedAt.Time
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetInventoryItem returns a single inventory item by ID
func GetInventoryItem(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
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

		var item models.Inventory
		var expiry sql.NullTime
		var foodGroup sql.NullString
		err = db.QueryRow(`
			SELECT item_id, canonical_name, qty, unit, food_group, estimated_expiry, is_manual, created_at, updated_at
			FROM inventory
			WHERE item_id = $1 AND kitchen_id = $2
		`, id, kitchen.KitchenID).Scan(
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
		kitchen, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if kitchen == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}
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
			err = db.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, estimated_expiry, is_manual, user_id, kitchen_id, food_group)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				RETURNING item_id, created_at, updated_at, estimated_expiry
			`, req.CanonicalName, req.Qty, req.Unit, *expiry, req.IsManual, userID, kitchen.KitchenID, foodGroup).Scan(&itemID, &createdAt, &updatedAt, &dbExpiry)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			err = db.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, is_manual, user_id, kitchen_id, food_group)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING item_id, created_at, updated_at, estimated_expiry
			`, req.CanonicalName, req.Qty, req.Unit, req.IsManual, userID, kitchen.KitchenID, foodGroup).Scan(&itemID, &createdAt, &updatedAt, &dbExpiry)
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

		RemoveFromShoppingList(db, kitchen.KitchenID, req.CanonicalName)

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

		var patch models.InventoryPatchRequest
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if patch.IsEmpty() {
			http.Error(w, "no fields to update", http.StatusBadRequest)
			return
		}

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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		current, err := lockAndLoadInventoryItemForUpdate(tx, id, kitchen.KitchenID)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Item not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		merged, expiry, clearExpiry, err := mergeInventoryPatch(current, patch)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if expiry != nil {
			_, err = tx.Exec(`
				UPDATE inventory
				SET canonical_name = $1, qty = $2, unit = $3, estimated_expiry = $4, is_manual = $5, updated_at = NOW()
				WHERE item_id = $6 AND kitchen_id = $7
			`, merged.CanonicalName, merged.Qty, merged.Unit, *expiry, merged.IsManual, id, kitchen.KitchenID)
		} else if clearExpiry {
			_, err = tx.Exec(`
				UPDATE inventory
				SET canonical_name = $1, qty = $2, unit = $3, estimated_expiry = NULL, is_manual = $4, updated_at = NOW()
				WHERE item_id = $5 AND kitchen_id = $6
			`, merged.CanonicalName, merged.Qty, merged.Unit, merged.IsManual, id, kitchen.KitchenID)
		} else {
			_, err = tx.Exec(`
				UPDATE inventory
				SET canonical_name = $1, qty = $2, unit = $3, is_manual = $4, updated_at = NOW()
				WHERE item_id = $5 AND kitchen_id = $6
			`, merged.CanonicalName, merged.Qty, merged.Unit, merged.IsManual, id, kitchen.KitchenID)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// If the patch cleared expiry, ask the AI to re-estimate.
		if clearExpiry && producer != nil {
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockInventoryItem(tx, id, kitchen.KitchenID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Item not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec("DELETE FROM inventory WHERE item_id = $1 AND kitchen_id = $2", id, kitchen.KitchenID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		if err := dblock.LockInventoryItem(tx, id, kitchen.KitchenID); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Item not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec(
			`UPDATE inventory SET estimated_expiry = CURRENT_DATE - 1, updated_at = NOW()
			 WHERE item_id = $1 AND kitchen_id = $2`, id, kitchen.KitchenID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Item marked as expired"})
	}
}

// GetExpiringItems returns items in the expiring bucket (legacy flat-array endpoint).
func GetExpiringItems(db *sql.DB) http.HandlerFunc {
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
		items, err := queryExpiringInventory(db, kitchen.KitchenID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}

// GetExpiredItems returns items in the expired bucket (legacy flat-array endpoint).
func GetExpiredItems(db *sql.DB) http.HandlerFunc {
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
		schedulePurgeStaleExpired(db, kitchen.KitchenID)
		items, err := queryExpiredInventory(db, kitchen.KitchenID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}
