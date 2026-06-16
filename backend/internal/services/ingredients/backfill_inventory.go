package ingredients

import (
	"context"
	"database/sql"
	"strings"
)

// InventoryBackfillResult summarizes a catalog normalization run.
type InventoryBackfillResult struct {
	Scanned   int      `json:"scanned"`
	Updated   int      `json:"updated"`
	Merged    int      `json:"merged"`
	Unchanged int      `json:"unchanged"`
	Unmatched int      `json:"unmatched"`
	Samples   []string `json:"unmatched_samples,omitempty"`
}

type inventoryRow struct {
	ItemID        string
	KitchenID     string
	CanonicalName string
	Qty           float64
	Unit          string
	FoodGroup     string
}

// BackfillInventoryCatalog rewrites inventory canonical_name (and food_group) to match
// ingredients/catalog.json for all rows, optionally scoped to one kitchen.
func BackfillInventoryCatalog(ctx context.Context, db *sql.DB, kitchenID string) (InventoryBackfillResult, error) {
	rows, err := listInventoryRows(ctx, db, kitchenID)
	if err != nil {
		return InventoryBackfillResult{}, err
	}

	var res InventoryBackfillResult
	unmatchedSet := map[string]struct{}{}

	for _, row := range rows {
		res.Scanned++
		match, ok := Resolve(row.CanonicalName)
		if !ok {
			res.Unmatched++
			if len(unmatchedSet) < 25 {
				unmatchedSet[row.CanonicalName] = struct{}{}
			}
			continue
		}

		targetName := strings.TrimSpace(match.Ingredient.Name)
		targetGroup := strings.TrimSpace(match.Ingredient.FoodGroup)
		if targetGroup == "" {
			targetGroup = "other"
		}

		nameSame := strings.EqualFold(strings.TrimSpace(row.CanonicalName), targetName)
		groupSame := strings.EqualFold(strings.TrimSpace(row.FoodGroup), targetGroup)
		if nameSame && groupSame {
			// Still set ingredient_id if missing.
			if match.Ingredient.IngredientID != "" {
				if _, err := db.ExecContext(ctx, `
					UPDATE inventory SET ingredient_id = $1, updated_at = NOW()
					WHERE item_id = $2::uuid AND ingredient_id IS NULL
				`, match.Ingredient.IngredientID, row.ItemID); err != nil {
					return res, err
				}
			}
			res.Unchanged++
			continue
		}

		if err := applyInventoryCatalogMatch(ctx, db, row, targetName, targetGroup, match.Ingredient.IngredientID, &res); err != nil {
			return res, err
		}
	}

	for name := range unmatchedSet {
		res.Samples = append(res.Samples, name)
	}
	return res, nil
}

func listInventoryRows(ctx context.Context, db *sql.DB, kitchenID string) ([]inventoryRow, error) {
	var rows *sql.Rows
	var err error
	if strings.TrimSpace(kitchenID) == "" {
		rows, err = db.QueryContext(ctx, `
			SELECT item_id::text, kitchen_id::text, canonical_name, qty, unit,
				COALESCE(NULLIF(TRIM(food_group), ''), 'other')
			FROM inventory
			ORDER BY kitchen_id, LOWER(canonical_name), unit, item_id
		`)
	} else {
		rows, err = db.QueryContext(ctx, `
			SELECT item_id::text, kitchen_id::text, canonical_name, qty, unit,
				COALESCE(NULLIF(TRIM(food_group), ''), 'other')
			FROM inventory
			WHERE kitchen_id = $1
			ORDER BY LOWER(canonical_name), unit, item_id
		`, kitchenID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []inventoryRow
	for rows.Next() {
		var row inventoryRow
		if err := rows.Scan(&row.ItemID, &row.KitchenID, &row.CanonicalName, &row.Qty, &row.Unit, &row.FoodGroup); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func applyInventoryCatalogMatch(ctx context.Context, db *sql.DB, row inventoryRow, targetName, targetGroup, ingredientID string, res *InventoryBackfillResult) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var existingID string
	var existingQty float64
	err = tx.QueryRowContext(ctx, `
		SELECT item_id::text, qty
		FROM inventory
		WHERE kitchen_id = $1
			AND LOWER(TRIM(canonical_name)) = LOWER(TRIM($2))
			AND unit = $3
			AND item_id <> $4::uuid
		LIMIT 1
	`, row.KitchenID, targetName, row.Unit, row.ItemID).Scan(&existingID, &existingQty)

	if err == nil {
		if _, err := tx.ExecContext(ctx, `
		UPDATE inventory
		SET qty = qty + $1,
			food_group = $2,
			ingredient_id = COALESCE($3, ingredient_id),
			updated_at = NOW()
		WHERE item_id = $4::uuid
	`, row.Qty, targetGroup, nullIngredientID(ingredientID), existingID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM inventory WHERE item_id = $1::uuid`, row.ItemID); err != nil {
			return err
		}
		res.Merged++
		return tx.Commit()
	}
	if err != sql.ErrNoRows {
		return err
	}

		if _, err := tx.ExecContext(ctx, `
			UPDATE inventory
			SET canonical_name = $1,
				food_group = $2,
				ingredient_id = $3,
				updated_at = NOW()
			WHERE item_id = $4::uuid
		`, targetName, targetGroup, nullIngredientID(ingredientID), row.ItemID); err != nil {
		return err
	}
	res.Updated++
	return tx.Commit()
}

func nullIngredientID(id string) interface{} {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	return id
}
