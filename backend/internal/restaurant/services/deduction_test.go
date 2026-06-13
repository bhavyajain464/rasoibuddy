package services

import (
	"context"
	"testing"

	"kitchenai-backend/pkg/contracts"
)

type mockInventory struct {
	items []contracts.InventoryItem
}

func (m *mockInventory) ListByKitchen(ctx context.Context, kitchenID string) ([]contracts.InventoryItem, error) {
	return m.items, nil
}

func (m *mockInventory) FindByName(ctx context.Context, kitchenID, name string) (*contracts.InventoryItem, error) {
	return nil, nil
}

func (m *mockInventory) AdjustQty(ctx context.Context, in contracts.AdjustQtyInput) (*contracts.InventoryMovement, error) {
	return &contracts.InventoryMovement{
		MovementID:  "mov-1",
		KitchenID:   in.KitchenID,
		ItemID:      in.ItemID,
		ActorUserID: in.ActorUserID,
		DeltaQty:    in.DeltaQty,
		Reason:      in.Reason,
	}, nil
}

func TestDeductionEngine_DeductForOrder(t *testing.T) {
	inv := &mockInventory{
		items: []contracts.InventoryItem{
			{ItemID: "item-1", CanonicalName: "Tomato", Qty: 10, Unit: "kg"},
		},
	}
	engine := NewDeductionEngine(inv)

	menuItemID := "menu-1"
	result, err := engine.DeductForOrder(
		context.Background(),
		"kitchen-1",
		"order-1",
		"user-1",
		[]OrderLine{{MenuItemID: menuItemID, Qty: 2}},
		map[string][]RecipeIngredient{
			menuItemID: {
				{IngredientName: "Tomato", Qty: 0.5, Unit: "kg", WasteFactor: 1},
			},
		},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Movements) != 1 {
		t.Fatalf("expected 1 movement, got %d", len(result.Movements))
	}
	if result.Movements[0].DeltaQty >= 0 {
		t.Fatalf("expected negative delta, got %v", result.Movements[0].DeltaQty)
	}
}

func TestDeductionEngine_MixedVegetablesNotMatchedToOil(t *testing.T) {
	inv := &mockInventory{
		items: []contracts.InventoryItem{
			{ItemID: "oil-1", CanonicalName: "Vegetable Oil", Qty: 5000, Unit: "ml"},
			{ItemID: "carrot-1", CanonicalName: "Carrot", Qty: 2000, Unit: "g"},
		},
	}
	engine := NewDeductionEngine(inv)
	menuItemID := "veg-pulao"

	result, err := engine.DeductForOrder(
		context.Background(),
		"kitchen-1",
		"order-1",
		"user-1",
		[]OrderLine{{MenuItemID: menuItemID, Qty: 1}},
		map[string][]RecipeIngredient{
			menuItemID: {
				{IngredientName: "mixed vegetables", Qty: 80, Unit: "g", WasteFactor: 1.0},
			},
		},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Movements) != 1 {
		t.Fatalf("expected 1 movement (carrot only), got %d", len(result.Movements))
	}
	if result.Movements[0].ItemID != "carrot-1" {
		t.Fatalf("expected carrot deduction, got item %s", result.Movements[0].ItemID)
	}
}
