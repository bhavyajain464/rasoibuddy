package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/contracts"
)

type ZomatoMenuSeedResult struct {
	MenuAdded       []string `json:"menu_added"`
	MenuSkipped     []string `json:"menu_skipped"`
	InventoryAdded  []string `json:"inventory_added"`
	InventoryExists []string `json:"inventory_exists"`
	Errors          []string `json:"errors,omitempty"`
}

func (s *MenuService) upsertInventoryItem(ctx context.Context, kitchenID, userID, name, unit string, qty float64) (string, bool, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", false, fmt.Errorf("ingredient name required")
	}
	if unit == "" {
		unit = "g"
	}
	if qty <= 0 {
		qty = defaultStockQty(name, unit)
	}

	var id string
	err := s.db.QueryRowContext(ctx, `
		SELECT item_id::text FROM inventory
		WHERE kitchen_id = $1 AND LOWER(canonical_name) = LOWER($2)
	`, kitchenID, name).Scan(&id)
	if err == nil {
		return id, false, nil
	}
	if err != sql.ErrNoRows {
		return "", false, err
	}

	err = s.db.QueryRowContext(ctx, `
		INSERT INTO inventory (kitchen_id, user_id, canonical_name, qty, unit, food_group, is_manual)
		VALUES ($1, $2, $3, $4, $5, 'other', TRUE)
		RETURNING item_id::text
	`, kitchenID, userID, name, qty, unit).Scan(&id)
	if err != nil {
		return "", false, err
	}
	return id, true, nil
}

func defaultStockQty(name, unit string) float64 {
	switch unit {
	case "ml":
		return 2000
	case "pcs":
		return 50
	default:
		n := strings.ToLower(name)
		if strings.Contains(n, "spice") || strings.Contains(n, "powder") || strings.Contains(n, "masala") {
			return 500
		}
		return 5000
	}
}

func collectUniqueIngredients(dishes []ZomatoMenuDish) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, dish := range dishes {
		for _, ing := range dish.Ingredients {
			name := strings.TrimSpace(ing)
			if name == "" {
				continue
			}
			key := strings.ToLower(name)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, name)
		}
	}
	return out
}

// SeedFromZomatoMenu imports dishes from a Zomato menu export, attaches recipe BOM,
// and ensures all ingredients exist in kitchen inventory.
func (s *MenuService) SeedFromZomatoMenu(ctx context.Context, kitchenID, userID, menuPath string) (*ZomatoMenuSeedResult, error) {
	dishes, err := ParseZomatoMenu(menuPath)
	if err != nil {
		return nil, err
	}
	return s.SeedFromZomatoDishes(ctx, kitchenID, userID, dishes)
}

// SeedFromZomatoDishes imports parsed Zomato dishes, attaches recipe BOM,
// and ensures all ingredients exist in kitchen inventory.
func (s *MenuService) SeedFromZomatoDishes(ctx context.Context, kitchenID, userID string, dishes []ZomatoMenuDish) (*ZomatoMenuSeedResult, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, fmt.Errorf("user_id required")
	}

	result := &ZomatoMenuSeedResult{
		MenuAdded:       make([]string, 0),
		MenuSkipped:     make([]string, 0),
		InventoryAdded:  make([]string, 0),
		InventoryExists: make([]string, 0),
		Errors:          make([]string, 0),
	}
	if warns := attachDishIngredientsFromGroq(ctx, s.cfg, dishes); len(warns) > 0 {
		result.Errors = append(result.Errors, warns...)
	}

	for _, ingName := range collectUniqueIngredients(dishes) {
		_, unit := defaultIngredientQty(ingName)
		qty := defaultStockQty(ingName, unit)
		id, created, err := s.upsertInventoryItem(ctx, kitchenID, userID, ingName, unit, qty)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("inventory %s: %v", ingName, err))
			continue
		}
		if created {
			result.InventoryAdded = append(result.InventoryAdded, ingName)
		} else {
			result.InventoryExists = append(result.InventoryExists, ingName)
		}
		_ = id
	}

	var inventoryItems []contracts.InventoryItem
	items, err := s.db.QueryContext(ctx, `
		SELECT item_id::text, kitchen_id::text, canonical_name, qty, unit,
		       COALESCE(food_group, 'other'), estimated_expiry, is_manual, created_at, updated_at
		FROM inventory WHERE kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer items.Close()
	for items.Next() {
		var it contracts.InventoryItem
		var expiry sql.NullTime
		if err := items.Scan(&it.ItemID, &it.KitchenID, &it.CanonicalName, &it.Qty, &it.Unit,
			&it.FoodGroup, &expiry, &it.IsManual, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		if expiry.Valid {
			t := expiry.Time
			it.EstimatedExpiry = &t
		}
		inventoryItems = append(inventoryItems, it)
	}
	if err := items.Err(); err != nil {
		return nil, err
	}

	for _, dish := range dishes {
		exists, err := s.menuItemExistsByName(ctx, kitchenID, dish.Name)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dish.Name, err))
			continue
		}
		if exists {
			result.MenuSkipped = append(result.MenuSkipped, dish.Name)
			continue
		}

		item, err := s.UpsertMenuItem(ctx, kitchenID, MenuItem{
			Name:       dish.Name,
			Category:   dish.Category,
			PriceCents: dish.PriceCents,
			IsActive:   true,
		})
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", dish.Name, err))
			continue
		}

		ings := make([]RecipeIngredient, 0, len(dish.Ingredients))
		sortOrder := 1
		for _, ingName := range dish.Ingredients {
			partIngs := catalogRecipeIngredients(ingName, sortOrder, inventoryItems)
			ings = append(ings, partIngs...)
			sortOrder += len(partIngs)
		}
		if _, err := s.SetRecipeIngredients(ctx, kitchenID, item.MenuItemID, ings); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s BOM: %v", dish.Name, err))
		}
		result.MenuAdded = append(result.MenuAdded, dish.Name)
	}

	return result, nil
}

// TopUpLowStock raises inventory rows below kitchen default stock levels (for demo/dev kitchens).
func (s *MenuService) TopUpLowStock(ctx context.Context, kitchenID string) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT item_id::text, canonical_name, qty, unit
		FROM inventory WHERE kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	updated := 0
	for rows.Next() {
		var id, name, unit string
		var qty float64
		if err := rows.Scan(&id, &name, &qty, &unit); err != nil {
			return updated, err
		}
		minQty := defaultStockQty(name, unit)
		if qty >= minQty {
			continue
		}
		if _, err := s.db.ExecContext(ctx, `
			UPDATE inventory SET qty = $3, updated_at = CURRENT_TIMESTAMP
			WHERE item_id = $1 AND kitchen_id = $2
		`, id, kitchenID, minQty); err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}
