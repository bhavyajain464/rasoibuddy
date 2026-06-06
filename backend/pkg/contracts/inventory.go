package contracts

import (
	"context"
	"time"
)

// InventoryItem is the platform inventory row (kitchen-scoped).
type InventoryItem struct {
	ItemID          string
	KitchenID       string
	CanonicalName   string
	Qty             float64
	Unit            string
	FoodGroup       string
	EstimatedExpiry *time.Time
	IsManual        bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// InventoryMovement records a stock change for audit.
type InventoryMovement struct {
	MovementID   string
	KitchenID    string
	ItemID       string
	ActorUserID  string
	OrderID      *string
	DeltaQty     float64
	Reason       string
	CreatedAt    time.Time
}

// AdjustQtyInput applies a signed quantity change with audit metadata.
type AdjustQtyInput struct {
	KitchenID   string
	ItemID      string
	ActorUserID string
	OrderID     *string
	DeltaQty    float64
	Reason      string
}

// InventoryService is the cross-module inventory boundary.
type InventoryService interface {
	ListByKitchen(ctx context.Context, kitchenID string) ([]InventoryItem, error)
	FindByName(ctx context.Context, kitchenID, name string) (*InventoryItem, error)
	AdjustQty(ctx context.Context, in AdjustQtyInput) (*InventoryMovement, error)
}
