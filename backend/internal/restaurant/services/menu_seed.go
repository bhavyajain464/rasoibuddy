package services

import (
	"context"
	"fmt"
	"strings"

	consumersvc "kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/contracts"
	"kitchenai-backend/pkg/units"
)

// DefaultRestaurantCatalogIDs are vegetarian mains suitable for a typical Indian restaurant menu.
var DefaultRestaurantCatalogIDs = []string{
	"chana-masala",
	"dal-makhani",
	"matar-paneer",
	"kadai-paneer",
	"palak-paneer",
	"rajma-masala",
	"dal-tadka",
	"veg-pulao",
	"paneer-butter-masala",
}

type CatalogSeedResult struct {
	Added   []string `json:"added"`
	Skipped []string `json:"skipped"`
	Errors  []string `json:"errors,omitempty"`
}

func catalogDishByID(id string) (*consumersvc.CatalogDish, bool) {
	id = strings.TrimSpace(strings.ToLower(id))
	for _, d := range consumersvc.DishCatalog() {
		if strings.EqualFold(strings.TrimSpace(d.ID), id) {
			copy := d
			return &copy, true
		}
	}
	return nil, false
}

func defaultIngredientQty(name string) (float64, string) {
	n := strings.ToLower(name)
	switch {
	case strings.Contains(n, "oil"), strings.Contains(n, "ghee"), strings.Contains(n, "cream"), strings.Contains(n, "milk"):
		return 30, "ml"
	case strings.Contains(n, "dal"), strings.Contains(n, "rice"), strings.Contains(n, "paneer"), strings.Contains(n, "potato"), strings.Contains(n, "rajma"), strings.Contains(n, "chana"):
		return 150, "g"
	case strings.Contains(n, "masala"), strings.Contains(n, "spice"), strings.Contains(n, "powder"), strings.Contains(n, "chilli"):
		return 15, "g"
	default:
		return 80, "g"
	}
}

func catalogPriceCents(d consumersvc.CatalogDish) int {
	base := 14900
	if d.CookTimeMinutes > 0 {
		base += d.CookTimeMinutes * 100
	}
	switch strings.ToLower(strings.TrimSpace(d.Effort)) {
	case "high":
		base += 1000
	case "low":
		base -= 500
	}
	if base < 9900 {
		base = 9900
	}
	return base
}

func catalogCategory(d consumersvc.CatalogDish) string {
	if len(d.MealType) > 0 {
		return strings.ToLower(strings.TrimSpace(d.MealType[0]))
	}
	return "main"
}

func (s *MenuService) menuItemExistsByName(ctx context.Context, kitchenID, name string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM menu_items
			WHERE kitchen_id = $1 AND LOWER(name) = LOWER($2)
		)
	`, kitchenID, strings.TrimSpace(name)).Scan(&exists)
	return exists, err
}

func matchInventoryForIngredient(name, ingUnit string, items []contracts.InventoryItem) *string {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	for _, it := range items {
		if strings.EqualFold(it.CanonicalName, name) && units.Compatible(ingUnit, it.Unit) {
			id := it.ItemID
			return &id
		}
	}
	for _, it := range items {
		if consumersvc.IngredientMatchesPantry(name, []string{it.CanonicalName}) && units.Compatible(ingUnit, it.Unit) {
			id := it.ItemID
			return &id
		}
	}
	return nil
}

func catalogRecipeIngredients(ingName string, sortStart int, inventoryItems []contracts.InventoryItem) []RecipeIngredient {
	expanded := consumersvc.ExpandCompoundGrocery(ingName)
	if len(expanded) > 1 || (len(expanded) == 1 && !strings.EqualFold(expanded[0], ingName)) {
		baseQty, baseUnit := defaultIngredientQty(ingName)
		perPart := baseQty / float64(len(expanded))
		out := make([]RecipeIngredient, 0, len(expanded))
		for i, partName := range expanded {
			ri := RecipeIngredient{
				IngredientName: partName,
				Qty:            perPart,
				Unit:           baseUnit,
				WasteFactor:    1.05,
				SortOrder:      sortStart + i,
			}
			if invID := matchInventoryForIngredient(partName, baseUnit, inventoryItems); invID != nil {
				ri.InventoryItemID = invID
			}
			out = append(out, ri)
		}
		return out
	}

	qty, unit := defaultIngredientQty(ingName)
	ri := RecipeIngredient{
		IngredientName: ingName,
		Qty:            qty,
		Unit:           unit,
		WasteFactor:    1.05,
		SortOrder:      sortStart,
	}
	if invID := matchInventoryForIngredient(ingName, unit, inventoryItems); invID != nil {
		ri.InventoryItemID = invID
	}
	return []RecipeIngredient{ri}
}

// SeedFromCatalog imports catalog dishes (with BOM) into a restaurant kitchen menu.
func (s *MenuService) SeedFromCatalog(ctx context.Context, kitchenID string, catalogIDs []string, inv contracts.InventoryService) (*CatalogSeedResult, error) {
	if len(catalogIDs) == 0 {
		catalogIDs = DefaultRestaurantCatalogIDs
	}

	var inventoryItems []contracts.InventoryItem
	if inv != nil {
		items, err := inv.ListByKitchen(ctx, kitchenID)
		if err != nil {
			return nil, err
		}
		inventoryItems = items
	}

	result := &CatalogSeedResult{
		Added:   make([]string, 0),
		Skipped: make([]string, 0),
		Errors:  make([]string, 0),
	}

	for _, id := range catalogIDs {
		dish, ok := catalogDishByID(id)
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: not in catalog", id))
			continue
		}
		label := dish.DisplayLabel()
		exists, err := s.menuItemExistsByName(ctx, kitchenID, label)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", label, err))
			continue
		}
		if exists {
			result.Skipped = append(result.Skipped, label)
			continue
		}

		item, err := s.UpsertMenuItem(ctx, kitchenID, MenuItem{
			Name:       label,
			Category:   catalogCategory(*dish),
			PriceCents: catalogPriceCents(*dish),
			IsActive:   true,
		})
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", label, err))
			continue
		}

		ings := make([]RecipeIngredient, 0, len(dish.CatalogIngredients())*2)
		sortOrder := 1
		for _, ingName := range dish.CatalogIngredients() {
			partIngs := catalogRecipeIngredients(ingName, sortOrder, inventoryItems)
			ings = append(ings, partIngs...)
			sortOrder += len(partIngs)
		}
		if _, err := s.SetRecipeIngredients(ctx, kitchenID, item.MenuItemID, ings); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s BOM: %v", label, err))
		}
		result.Added = append(result.Added, label)
	}

	return result, nil
}
