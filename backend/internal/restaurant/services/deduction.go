package services

import (
	"context"
	"fmt"
	"strings"

	consumersvc "kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/contracts"
	"kitchenai-backend/pkg/units"
)

type DeductionLine struct {
	ItemID   string
	ItemName string
	DeltaQty float64
	Unit     string
}

type DeductionResult struct {
	Movements []contracts.InventoryMovement
	Lines     []DeductionLine
	Errors    []string
}

type DeductionEngine struct {
	inventory contracts.InventoryService
}

func NewDeductionEngine(inventory contracts.InventoryService) *DeductionEngine {
	return &DeductionEngine{inventory: inventory}
}

func expandedRecipeParts(ing RecipeIngredient) []RecipeIngredient {
	expanded := consumersvc.ExpandCompoundGrocery(ing.IngredientName)
	if len(expanded) <= 1 {
		return []RecipeIngredient{ing}
	}
	if len(expanded) == 1 && strings.EqualFold(strings.TrimSpace(expanded[0]), strings.TrimSpace(ing.IngredientName)) {
		return []RecipeIngredient{ing}
	}

	share := ing.Qty / float64(len(expanded))
	out := make([]RecipeIngredient, 0, len(expanded))
	for _, name := range expanded {
		part := ing
		part.IngredientName = name
		part.Qty = share
		part.InventoryItemID = nil
		out = append(out, part)
	}
	return out
}

func resolveInventoryTarget(
	ing RecipeIngredient,
	items []contracts.InventoryItem,
	itemByID map[string]contracts.InventoryItem,
	itemByName map[string]contracts.InventoryItem,
) *contracts.InventoryItem {
	if ing.InventoryItemID != nil && *ing.InventoryItemID != "" {
		if it, ok := itemByID[*ing.InventoryItemID]; ok && units.Compatible(ing.Unit, it.Unit) {
			copy := it
			return &copy
		}
	}

	name := strings.ToLower(strings.TrimSpace(ing.IngredientName))
	if it, ok := itemByName[name]; ok && units.Compatible(ing.Unit, it.Unit) {
		copy := it
		return &copy
	}

	for _, it := range items {
		if strings.EqualFold(it.CanonicalName, ing.IngredientName) && units.Compatible(ing.Unit, it.Unit) {
			copy := it
			return &copy
		}
	}

	for _, it := range items {
		if consumersvc.IngredientMatchesPantry(ing.IngredientName, []string{it.CanonicalName}) && units.Compatible(ing.Unit, it.Unit) {
			copy := it
			return &copy
		}
	}
	return nil
}

func recipePartNeedQty(part RecipeIngredient, lineQty int) (float64, string, error) {
	waste := part.WasteFactor
	if waste <= 0 {
		waste = 1.0
	}
	unit := strings.TrimSpace(part.Unit)
	if unit == "" {
		unit = "g"
	}
	need := part.Qty * waste * float64(lineQty)
	return need, unit, nil
}

func checkInventoryNeed(
	part RecipeIngredient,
	line OrderLine,
	items []contracts.InventoryItem,
	itemByID map[string]contracts.InventoryItem,
	itemByName map[string]contracts.InventoryItem,
) *string {
	target := resolveInventoryTarget(part, items, itemByID, itemByName)
	if target == nil {
		msg := fmt.Sprintf("inventory not found: %s (%s)", part.IngredientName, line.MenuItemName)
		return &msg
	}
	need, unit, err := recipePartNeedQty(part, line.Qty)
	if err != nil {
		msg := fmt.Sprintf("unit error for %s (%s): %v", part.IngredientName, line.MenuItemName, err)
		return &msg
	}
	converted, convErr := units.ConvertQty(need, unit, target.Unit)
	if convErr != nil {
		msg := fmt.Sprintf("unit conversion for %s (%s): %v", part.IngredientName, line.MenuItemName, convErr)
		return &msg
	}
	if target.Qty+0.0001 < converted {
		msg := fmt.Sprintf("insufficient stock: %s (have %.1f %s, need %.1f %s for %s)",
			target.CanonicalName, target.Qty, target.Unit, converted, target.Unit, line.MenuItemName)
		return &msg
	}
	return nil
}

// DeductForOrder expands BOM for order lines and decrements inventory via InventoryService.
func (e *DeductionEngine) DeductForOrder(
	ctx context.Context,
	kitchenID, orderID, actorUserID string,
	orderLines []OrderLine,
	recipeIngredients map[string][]RecipeIngredient,
) (*DeductionResult, error) {
	items, err := e.inventory.ListByKitchen(ctx, kitchenID)
	if err != nil {
		return nil, err
	}

	itemByID := map[string]contracts.InventoryItem{}
	itemByName := map[string]contracts.InventoryItem{}
	for _, it := range items {
		itemByID[it.ItemID] = it
		itemByName[strings.ToLower(it.CanonicalName)] = it
	}

	type deductNeed struct {
		itemID string
		name   string
		qty    float64
		unit   string
	}
	needs := map[string]*deductNeed{}

	for _, line := range orderLines {
		ings := recipeIngredients[line.MenuItemID]
		for _, ing := range ings {
			for _, part := range expandedRecipeParts(ing) {
				target := resolveInventoryTarget(part, items, itemByID, itemByName)
				if target == nil {
					continue
				}

				needQty, unit, err := recipePartNeedQty(part, line.Qty)
				if err != nil {
					return nil, err
				}
				converted, convErr := units.ConvertQty(needQty, unit, target.Unit)
				if convErr != nil {
					return nil, fmt.Errorf("unit conversion for %s: %w", part.IngredientName, convErr)
				}

				key := target.ItemID
				if n, ok := needs[key]; ok {
					n.qty += converted
				} else {
					needs[key] = &deductNeed{itemID: target.ItemID, name: target.CanonicalName, qty: converted, unit: target.Unit}
				}
			}
		}
	}

	result := &DeductionResult{}
	for _, n := range needs {
		if n.qty <= 0 {
			continue
		}
		orderIDCopy := orderID
		mov, err := e.inventory.AdjustQty(ctx, contracts.AdjustQtyInput{
			KitchenID:   kitchenID,
			ItemID:      n.itemID,
			ActorUserID: actorUserID,
			OrderID:     &orderIDCopy,
			DeltaQty:    -n.qty,
			Reason:      "order_deduct",
		})
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", n.name, err))
			if len(result.Movements) > 0 {
				_, _ = e.ReverseOrder(ctx, kitchenID, orderID, actorUserID, result.Movements)
				result.Movements = nil
				result.Lines = nil
			}
			return result, fmt.Errorf("deduction had %d errors: %s", len(result.Errors), strings.Join(result.Errors, "; "))
		}
		result.Movements = append(result.Movements, *mov)
		result.Lines = append(result.Lines, DeductionLine{
			ItemID: n.itemID, ItemName: n.name, DeltaQty: -n.qty, Unit: n.unit,
		})
	}
	return result, nil
}

// ValidateDeduction reports missing menu links, recipes, or inventory targets before deducting.
func (e *DeductionEngine) ValidateDeduction(
	orderLines []OrderLine,
	recipeIngredients map[string][]RecipeIngredient,
	items []contracts.InventoryItem,
) []string {
	itemByID := map[string]contracts.InventoryItem{}
	itemByName := map[string]contracts.InventoryItem{}
	for _, it := range items {
		itemByID[it.ItemID] = it
		itemByName[strings.ToLower(it.CanonicalName)] = it
	}

	var missing []string
	for _, line := range orderLines {
		if strings.TrimSpace(line.MenuItemID) == "" {
			missing = append(missing, fmt.Sprintf("menu item not linked: %s", line.MenuItemName))
			continue
		}
		ings := recipeIngredients[line.MenuItemID]
		if len(ings) == 0 {
			missing = append(missing, fmt.Sprintf("no recipe for %s", line.MenuItemName))
			continue
		}
		for _, ing := range ings {
			for _, part := range expandedRecipeParts(ing) {
				if msg := checkInventoryNeed(part, line, items, itemByID, itemByName); msg != nil {
					missing = append(missing, *msg)
				}
			}
		}
	}
	return missing
}

// ReverseOrder restores stock from prior order_deduct movements.
func (e *DeductionEngine) ReverseOrder(ctx context.Context, kitchenID, orderID, actorUserID string, priorMovements []contracts.InventoryMovement) (*DeductionResult, error) {
	result := &DeductionResult{}
	for _, mov := range priorMovements {
		if mov.Reason != "order_deduct" {
			continue
		}
		orderIDCopy := orderID
		reversal, err := e.inventory.AdjustQty(ctx, contracts.AdjustQtyInput{
			KitchenID:   kitchenID,
			ItemID:      mov.ItemID,
			ActorUserID: actorUserID,
			OrderID:     &orderIDCopy,
			DeltaQty:    -mov.DeltaQty,
			Reason:      "void_reversal",
		})
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		result.Movements = append(result.Movements, *reversal)
	}
	if len(result.Errors) > 0 {
		return result, fmt.Errorf("reversal had errors")
	}
	return result, nil
}
