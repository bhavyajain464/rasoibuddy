package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
	"kitchenai-backend/internal/services/ingredients"
	"kitchenai-backend/pkg/units"
)

// RestaurantCatalogBackfillResult summarizes normalizing restaurant stock, buy list, and menu recipes
// to the shared home-kitchen ingredients catalog.
type RestaurantCatalogBackfillResult struct {
	KitchensScanned   int                               `json:"kitchens_scanned"`
	Inventory         ingredients.InventoryBackfillResult `json:"inventory"`
	ShoppingUpdated   int                               `json:"shopping_updated"`
	ShoppingUnchanged int                               `json:"shopping_unchanged"`
	ShoppingUnmatched int                               `json:"shopping_unmatched"`
	RecipeUpdated     int                               `json:"recipe_updated"`
	RecipeUnchanged   int                               `json:"recipe_unchanged"`
	RecipeUnmatched   int                               `json:"recipe_unmatched"`
	UnmatchedSamples  []string                          `json:"unmatched_samples,omitempty"`
}

func listRestaurantKitchenIDs(ctx context.Context, db *sql.DB, outletID string) ([]string, error) {
	outletID = strings.TrimSpace(outletID)
	if outletID != "" {
		var kind string
		if err := db.QueryRowContext(ctx, `SELECT kind FROM kitchens WHERE kitchen_id = $1`, outletID).Scan(&kind); err != nil {
			return nil, err
		}
		if kind != "restaurant" {
			return nil, fmt.Errorf("kitchen %s is not a restaurant outlet", outletID)
		}
		return []string{outletID}, nil
	}
	rows, err := db.QueryContext(ctx, `SELECT kitchen_id::text FROM kitchens WHERE kind = 'restaurant' ORDER BY created_at`)
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

// BackfillRestaurantCatalogData rewrites existing restaurant stock, shopping, and recipe lines
// to canonical names (and ingredient_id where applicable) from the shared Postgres catalog.
// Pass empty outletID to process all restaurant kitchens.
func BackfillRestaurantCatalogData(ctx context.Context, db *sql.DB, outletID string) (RestaurantCatalogBackfillResult, error) {
	catalogdb.Init(db)
	ingredients.InitCatalog(db)

	kitchenIDs, err := listRestaurantKitchenIDs(ctx, db, outletID)
	if err != nil {
		return RestaurantCatalogBackfillResult{}, err
	}

	var res RestaurantCatalogBackfillResult
	res.KitchensScanned = len(kitchenIDs)
	unmatched := map[string]struct{}{}

	for _, kitchenID := range kitchenIDs {
		invRes, err := ingredients.BackfillInventoryCatalog(ctx, db, kitchenID)
		if err != nil {
			return res, fmt.Errorf("inventory kitchen %s: %w", kitchenID, err)
		}
		mergeInventoryBackfill(&res.Inventory, invRes)
		for _, s := range invRes.Samples {
			if len(unmatched) < 30 {
				unmatched[s] = struct{}{}
			}
		}

		shopUp, shopSame, shopMiss, shopSamples, err := backfillShoppingCatalog(ctx, db, kitchenID)
		if err != nil {
			return res, fmt.Errorf("shopping kitchen %s: %w", kitchenID, err)
		}
		res.ShoppingUpdated += shopUp
		res.ShoppingUnchanged += shopSame
		res.ShoppingUnmatched += shopMiss
		for _, s := range shopSamples {
			if len(unmatched) < 30 {
				unmatched[s] = struct{}{}
			}
		}

		recUp, recSame, recMiss, recSamples, err := backfillRecipeCatalog(ctx, db, kitchenID)
		if err != nil {
			return res, fmt.Errorf("recipes kitchen %s: %w", kitchenID, err)
		}
		res.RecipeUpdated += recUp
		res.RecipeUnchanged += recSame
		res.RecipeUnmatched += recMiss
		for _, s := range recSamples {
			if len(unmatched) < 30 {
				unmatched[s] = struct{}{}
			}
		}
	}

	for name := range unmatched {
		res.UnmatchedSamples = append(res.UnmatchedSamples, name)
	}
	return res, nil
}

func mergeInventoryBackfill(dst *ingredients.InventoryBackfillResult, src ingredients.InventoryBackfillResult) {
	dst.Scanned += src.Scanned
	dst.Updated += src.Updated
	dst.Merged += src.Merged
	dst.Unchanged += src.Unchanged
	dst.Unmatched += src.Unmatched
}

func backfillShoppingCatalog(ctx context.Context, db *sql.DB, kitchenID string) (updated, unchanged, unmatched int, samples []string, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id::text, name, unit
		FROM shopping_items
		WHERE kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return 0, 0, 0, nil, err
	}
	defer rows.Close()

	sampleSet := map[string]struct{}{}
	for rows.Next() {
		var id, name, unit string
		if err := rows.Scan(&id, &name, &unit); err != nil {
			return updated, unchanged, unmatched, samples, err
		}
		cat, err := resolveGlobalCatalogIngredient(ctx, db, name)
		if err != nil {
			unmatched++
			if len(sampleSet) < 10 {
				sampleSet[name] = struct{}{}
			}
			continue
		}
		targetName := cat.Name
		targetUnit := units.Normalize(unit)
		if targetUnit == "" {
			targetUnit = units.Normalize(cat.DefaultUnit)
		}
		if strings.TrimSpace(name) == targetName && (targetUnit == "" || units.Normalize(unit) == targetUnit) {
			unchanged++
			continue
		}
		if _, err := db.ExecContext(ctx, `
			UPDATE shopping_items SET name = $2, unit = COALESCE(NULLIF($3, ''), unit)
			WHERE id = $1::uuid
		`, id, targetName, targetUnit); err != nil {
			return updated, unchanged, unmatched, samples, err
		}
		updated++
	}
	for s := range sampleSet {
		samples = append(samples, s)
	}
	return updated, unchanged, unmatched, samples, rows.Err()
}

func backfillRecipeCatalog(ctx context.Context, db *sql.DB, kitchenID string) (updated, unchanged, unmatched int, samples []string, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT ri.recipe_id::text, ri.ingredient_name
		FROM recipe_ingredients ri
		JOIN recipes r ON r.recipe_id = ri.recipe_id
		WHERE r.kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return 0, 0, 0, nil, err
	}
	defer rows.Close()

	sampleSet := map[string]struct{}{}
	for rows.Next() {
		var recipeID, name string
		if err := rows.Scan(&recipeID, &name); err != nil {
			return updated, unchanged, unmatched, samples, err
		}
		cat, err := resolveGlobalCatalogIngredient(ctx, db, name)
		if err != nil {
			unmatched++
			if len(sampleSet) < 10 {
				sampleSet[name] = struct{}{}
			}
			continue
		}
		if strings.TrimSpace(name) == cat.Name {
			unchanged++
			continue
		}
		if _, err := db.ExecContext(ctx, `
			UPDATE recipe_ingredients
			SET ingredient_name = $3
			WHERE recipe_id = $1::uuid AND ingredient_name = $2
		`, recipeID, name, cat.Name); err != nil {
			return updated, unchanged, unmatched, samples, err
		}
		updated++
	}
	for s := range sampleSet {
		samples = append(samples, s)
	}
	return updated, unchanged, unmatched, samples, rows.Err()
}
