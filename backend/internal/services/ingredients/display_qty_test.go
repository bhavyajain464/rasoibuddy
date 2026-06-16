package ingredients

import "testing"

func TestFormatPurchaseQtyLemonCount(t *testing.T) {
	lemon := &CatalogIngredient{
		IngredientID: "lemon",
		Name:         "Lemon",
		DefaultUnit:  "pcs",
		Units:        []string{"pcs"},
		FoodGroup:    "fruits",
	}
	got := FormatPurchaseQty(2, "pcs", lemon)
	if got != "2" {
		t.Fatalf("FormatPurchaseQty(lemon) = %q, want 2", got)
	}
}

func TestFormatPurchaseQtyWeight(t *testing.T) {
	onion := &CatalogIngredient{
		IngredientID: "onion",
		Name:         "Onion",
		DefaultUnit:  "kg",
		Units:        []string{"g", "kg"},
		FoodGroup:    "vegetables",
	}
	got := FormatPurchaseQty(1, "kg", onion)
	if got != "1 kg" {
		t.Fatalf("FormatPurchaseQty(onion) = %q, want 1 kg", got)
	}
}

func TestFormatPurchaseQtyZeroCountHidesUnit(t *testing.T) {
	lemon := &CatalogIngredient{
		IngredientID: "lemon",
		Name:         "Lemon",
		DefaultUnit:  "pcs",
		Units:        []string{"pcs"},
		FoodGroup:    "fruits",
	}
	if got := FormatPurchaseQty(0, "pcs", lemon); got != "" {
		t.Fatalf("zero count item = %q, want empty", got)
	}
}
