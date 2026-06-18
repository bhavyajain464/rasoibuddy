package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/contracts"
	"kitchenai-backend/pkg/units"
)

type AddInventoryInput struct {
	Name      string  `json:"name"`
	Qty       float64 `json:"qty"`
	Unit      string  `json:"unit"`
	FoodGroup string  `json:"food_group,omitempty"`
}

// AddInventory creates a stock row or adds quantity to an existing item (by name).
func AddInventory(ctx context.Context, db *sql.DB, inv contracts.InventoryService, kitchenID, userID string, in AddInventoryInput) (*InventoryListRow, error) {
	kitchenID = strings.TrimSpace(kitchenID)
	userID = strings.TrimSpace(userID)
	name := strings.TrimSpace(in.Name)
	if kitchenID == "" || userID == "" {
		return nil, fmt.Errorf("kitchen and user required")
	}
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	if in.Qty <= 0 {
		return nil, fmt.Errorf("qty must be positive")
	}

	catalog, err := resolveGlobalCatalogIngredient(ctx, db, name)
	if err != nil {
		return nil, err
	}
	name = catalog.Name
	catalogFoodGroup := catalog.FoodGroup

	unit := units.Normalize(strings.TrimSpace(in.Unit))
	if unit == "" {
		unit = units.Normalize(catalog.DefaultUnit)
	}
	if unit == "" {
		unit = "kg"
	}
	qty, unit, err := units.NormalizeStoredQty(in.Qty, unit)
	if err != nil {
		return nil, err
	}
	foodGroup := normalizeInventoryFoodGroup(catalogFoodGroup)

	var itemID string
	var existingQty float64
	err = db.QueryRowContext(ctx, `
		SELECT item_id::text, qty FROM inventory
		WHERE kitchen_id = $1 AND LOWER(canonical_name) = LOWER($2)
	`, kitchenID, name).Scan(&itemID, &existingQty)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	if err == sql.ErrNoRows {
		if err := db.QueryRowContext(ctx, `
			INSERT INTO inventory (kitchen_id, user_id, canonical_name, qty, unit, food_group, is_manual)
			VALUES ($1, $2, $3, $4, $5, $6, TRUE)
			RETURNING item_id::text
		`, kitchenID, userID, name, qty, unit, foodGroup).Scan(&itemID); err != nil {
			return nil, err
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO inventory_movements (kitchen_id, item_id, actor_user_id, delta_qty, reason)
			VALUES ($1, $2, $3, $4, 'receive')
		`, kitchenID, itemID, userID, qty); err != nil {
			return nil, err
		}
	} else {
		if _, err := inv.AdjustQty(ctx, contracts.AdjustQtyInput{
			KitchenID:   kitchenID,
			ItemID:      itemID,
			ActorUserID: userID,
			DeltaQty:    qty,
			Reason:      "receive",
		}); err != nil {
			return nil, err
		}
		if foodGroup != "other" {
			_, _ = db.ExecContext(ctx, `
				UPDATE inventory SET food_group = $3, updated_at = CURRENT_TIMESTAMP
				WHERE item_id = $1 AND kitchen_id = $2
				  AND COALESCE(NULLIF(TRIM(food_group), ''), 'other') = 'other'
			`, itemID, kitchenID, foodGroup)
		}
	}

	if compactErr := compactInventoryRowQty(ctx, db, kitchenID, itemID); compactErr != nil {
		return nil, compactErr
	}

	row := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT i.item_id::text, i.canonical_name, i.qty, i.unit,
			COALESCE(NULLIF(TRIM(ri.food_group), ''), NULLIF(TRIM(i.food_group), ''), 'other')
		%s
		WHERE i.item_id = $1 AND i.kitchen_id = $2
	`, inventoryFromClause()), itemID, kitchenID)
	var out InventoryListRow
	if err := row.Scan(&out.ItemID, &out.CanonicalName, &out.Qty, &out.Unit, &out.FoodGroup); err != nil {
		return nil, err
	}
	out.FoodGroup = normalizeInventoryFoodGroup(out.FoodGroup)
	return &out, nil
}

func compactInventoryRowQty(ctx context.Context, db *sql.DB, kitchenID, itemID string) error {
	var qty float64
	var unit string
	if err := db.QueryRowContext(ctx, `
		SELECT qty, unit FROM inventory WHERE item_id = $1 AND kitchen_id = $2
	`, itemID, kitchenID).Scan(&qty, &unit); err != nil {
		return err
	}
	nextQty, nextUnit := units.CompactQtyUnit(qty, unit)
	if nextQty == qty && nextUnit == units.Normalize(unit) {
		return nil
	}
	_, err := db.ExecContext(ctx, `
		UPDATE inventory SET qty = $3, unit = $4, updated_at = CURRENT_TIMESTAMP
		WHERE item_id = $1 AND kitchen_id = $2
	`, itemID, kitchenID, nextQty, nextUnit)
	return err
}
