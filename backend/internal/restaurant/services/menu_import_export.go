package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/contracts"
	"kitchenai-backend/pkg/units"
)

type MenuExportIngredient struct {
	IngredientName string
	Qty            float64
	Unit           string
	WasteFactor    float64
}

type MenuExportDish struct {
	MenuItemID  string
	Name        string
	Category    string
	PriceCents  int
	IsActive    bool
	Ingredients []MenuExportIngredient
}

type MenuImportResult struct {
	Added   []string `json:"added"`
	Updated []string `json:"updated"`
	Skipped []string `json:"skipped"`
	Errors  []string `json:"errors,omitempty"`
}

func (s *MenuService) exportMenuDishes(ctx context.Context, kitchenID string) ([]MenuExportDish, error) {
	kitchenID = strings.TrimSpace(kitchenID)
	if kitchenID == "" {
		return nil, fmt.Errorf("kitchen_id required")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT menu_item_id::text, name, category, price_cents, is_active
		FROM menu_items
		WHERE kitchen_id = $1
		ORDER BY LOWER(TRIM(category)), name, menu_item_id
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dishes := make([]MenuExportDish, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var d MenuExportDish
		if err := rows.Scan(&d.MenuItemID, &d.Name, &d.Category, &d.PriceCents, &d.IsActive); err != nil {
			return nil, err
		}
		dishes = append(dishes, d)
		ids = append(ids, d.MenuItemID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ingredientsByItem, err := s.loadRecipeIngredientsForMenuItems(ctx, kitchenID, ids)
	if err != nil {
		return nil, err
	}

	for i := range dishes {
		for _, ing := range ingredientsByItem[dishes[i].MenuItemID] {
			dishes[i].Ingredients = append(dishes[i].Ingredients, MenuExportIngredient{
				IngredientName: ing.IngredientName,
				Qty:            ing.Qty,
				Unit:           units.Normalize(ing.Unit),
				WasteFactor:    ing.WasteFactor,
			})
		}
		if dishes[i].Ingredients == nil {
			dishes[i].Ingredients = []MenuExportIngredient{}
		}
	}

	return dishes, nil
}

func (s *MenuService) importMenuDishes(ctx context.Context, kitchenID string, dishes []MenuExportDish) (*MenuImportResult, error) {
	kitchenID = strings.TrimSpace(kitchenID)
	if kitchenID == "" {
		return nil, fmt.Errorf("kitchen_id required")
	}
	if len(dishes) == 0 {
		return nil, fmt.Errorf("dishes required")
	}

	inventoryItems, err := s.loadKitchenInventory(ctx, kitchenID)
	if err != nil {
		return nil, err
	}

	byID, byName, err := s.loadMenuItemIndex(ctx, kitchenID)
	if err != nil {
		return nil, err
	}

	result := &MenuImportResult{
		Added:   make([]string, 0),
		Updated: make([]string, 0),
		Skipped: make([]string, 0),
		Errors:  make([]string, 0),
	}

	for _, dish := range dishes {
		name := strings.TrimSpace(dish.Name)
		if name == "" {
			result.Errors = append(result.Errors, "skipped row with empty name")
			continue
		}

		menuItemID := strings.TrimSpace(dish.MenuItemID)
		existingID := ""
		if menuItemID != "" {
			if _, ok := byID[menuItemID]; ok {
				existingID = menuItemID
			}
		}
		if existingID == "" {
			if id, ok := byName[strings.ToLower(name)]; ok {
				existingID = id
			}
		}

		isActive := dish.IsActive
		if existingID == "" {
			isActive = true
		}

		saved, err := s.UpsertMenuItem(ctx, kitchenID, MenuItem{
			MenuItemID: existingID,
			Name:       name,
			Category:   dish.Category,
			PriceCents: dish.PriceCents,
			IsActive:   isActive,
		})
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", name, err))
			continue
		}

		ings := exportIngredientsToRecipe(dish.Ingredients, inventoryItems)
		if _, err := s.SetRecipeIngredients(ctx, kitchenID, saved.MenuItemID, ings); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s BOM: %v", name, err))
		}

		byID[saved.MenuItemID] = name
		byName[strings.ToLower(name)] = saved.MenuItemID

		if existingID == "" {
			result.Added = append(result.Added, name)
		} else {
			result.Updated = append(result.Updated, name)
		}
	}

	return result, nil
}

func (s *MenuService) loadKitchenInventory(ctx context.Context, kitchenID string) ([]contracts.InventoryItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT item_id::text, kitchen_id::text, canonical_name, qty, unit,
		       COALESCE(food_group, 'other'), estimated_expiry, is_manual, created_at, updated_at
		FROM inventory WHERE kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]contracts.InventoryItem, 0)
	for rows.Next() {
		var it contracts.InventoryItem
		var expiry sql.NullTime
		if err := rows.Scan(&it.ItemID, &it.KitchenID, &it.CanonicalName, &it.Qty, &it.Unit,
			&it.FoodGroup, &expiry, &it.IsManual, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		if expiry.Valid {
			t := expiry.Time
			it.EstimatedExpiry = &t
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *MenuService) loadMenuItemIndex(ctx context.Context, kitchenID string) (byID map[string]string, byName map[string]string, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT menu_item_id::text, name FROM menu_items WHERE kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	byID = map[string]string{}
	byName = map[string]string{}
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, nil, err
		}
		byID[id] = name
		byName[strings.ToLower(strings.TrimSpace(name))] = id
	}
	return byID, byName, rows.Err()
}

func exportIngredientsToRecipe(raw []MenuExportIngredient, inventoryItems []contracts.InventoryItem) []RecipeIngredient {
	out := make([]RecipeIngredient, 0, len(raw))
	sortOrder := 1
	for _, ing := range raw {
		name := strings.TrimSpace(ing.IngredientName)
		if name == "" {
			continue
		}
		qty := ing.Qty
		if qty <= 0 {
			qty, _ = defaultIngredientQty(name)
		}
		unit := units.Normalize(ing.Unit)
		if unit == "" {
			_, unit = defaultIngredientQty(name)
		}
		waste := ing.WasteFactor
		if waste <= 0 {
			waste = 1.05
		}
		ri := RecipeIngredient{
			IngredientName: name,
			Qty:            qty,
			Unit:           unit,
			WasteFactor:    waste,
			SortOrder:      sortOrder,
		}
		if invID := matchInventoryForIngredient(name, unit, inventoryItems); invID != nil {
			ri.InventoryItemID = invID
		}
		out = append(out, ri)
		sortOrder++
	}
	return out
}
