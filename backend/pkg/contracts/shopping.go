package contracts

import "context"

// ShoppingItem is a kitchen-scoped shopping list row.
type ShoppingItem struct {
	ID          string
	KitchenID   string
	Name        string
	Qty         float64
	Unit        string
	IsPurchased bool
}

// ShoppingService is the cross-module shopping boundary (future extraction).
type ShoppingService interface {
	ListByKitchen(ctx context.Context, kitchenID string) ([]ShoppingItem, error)
}
