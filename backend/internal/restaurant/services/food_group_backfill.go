package services

import (
	"context"
	"database/sql"
	"fmt"
)

// BackfillRestaurantFoodGroups infers food_group on the global catalog and syncs restaurant stock rows.
func BackfillRestaurantFoodGroups(ctx context.Context, db *sql.DB) (catalogUpdated, inventoryUpdated int64, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT ingredient_id::text, name, food_group
		FROM restaurant_ingredients
	`)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	type row struct {
		id, name, group string
	}
	var pending []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.name, &r.group); err != nil {
			return 0, 0, err
		}
		pending = append(pending, r)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	for _, r := range pending {
		inferred := InferFoodGroupFromName(r.name)
		if inferred == normalizeInventoryFoodGroup(r.group) {
			continue
		}
		res, err := db.ExecContext(ctx, `
			UPDATE restaurant_ingredients
			SET food_group = $2
			WHERE ingredient_id = $1::uuid
		`, r.id, inferred)
		if err != nil {
			return catalogUpdated, inventoryUpdated, fmt.Errorf("catalog %s: %w", r.name, err)
		}
		n, _ := res.RowsAffected()
		catalogUpdated += n
	}

	res, err := db.ExecContext(ctx, `
		UPDATE inventory i
		SET food_group = ri.food_group,
		    updated_at = CURRENT_TIMESTAMP
		FROM restaurant_ingredients ri
		WHERE ri.name_normalized = LOWER(TRIM(i.canonical_name))
		  AND i.kitchen_id IN (SELECT kitchen_id FROM kitchens WHERE kind = 'restaurant')
		  AND COALESCE(NULLIF(TRIM(i.food_group), ''), 'other') <> ri.food_group
	`)
	if err != nil {
		return catalogUpdated, inventoryUpdated, err
	}
	inventoryUpdated, _ = res.RowsAffected()
	return catalogUpdated, inventoryUpdated, nil
}
