package services

import (
	"context"
	"database/sql"
	"fmt"
)

// BackfillRestaurantFoodGroups infers food_group on the shared ingredients catalog and syncs restaurant stock rows.
func BackfillRestaurantFoodGroups(ctx context.Context, db *sql.DB) (catalogUpdated, inventoryUpdated int64, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, canonical_name, COALESCE(metadata->>'food_group', 'other')
		FROM ingredients
		WHERE verified = true
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
			UPDATE ingredients
			SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('food_group', $2::text),
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, r.id, inferred)
		if err != nil {
			return catalogUpdated, inventoryUpdated, fmt.Errorf("catalog %s: %w", r.name, err)
		}
		n, _ := res.RowsAffected()
		catalogUpdated += n
	}

	res, err := db.ExecContext(ctx, `
		UPDATE inventory i
		SET food_group = cat.food_group,
		    updated_at = CURRENT_TIMESTAMP
		FROM (
			SELECT i2.item_id,
				COALESCE(NULLIF(TRIM(ing.metadata->>'food_group'), ''), 'other') AS food_group
			FROM inventory i2
			LEFT JOIN LATERAL (
				SELECT ing.metadata
				FROM ingredient_aliases ia
				JOIN ingredients ing ON ing.id = ia.ingredient_id
				WHERE ing.verified = true
				  AND ia.normalized = lower(unaccent(trim(i2.canonical_name)))
				ORDER BY ia.is_ambiguous ASC
				LIMIT 1
			) ing ON true
			WHERE i2.kitchen_id IN (SELECT kitchen_id FROM kitchens WHERE kind = 'restaurant')
		) cat
		WHERE i.item_id = cat.item_id
		  AND COALESCE(NULLIF(TRIM(i.food_group), ''), 'other') <> cat.food_group
	`)
	if err != nil {
		return catalogUpdated, inventoryUpdated, err
	}
	inventoryUpdated, _ = res.RowsAffected()
	return catalogUpdated, inventoryUpdated, nil
}
