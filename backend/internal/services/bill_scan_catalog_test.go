package services

import "testing"

func TestApplyCatalogMapping(t *testing.T) {
	items := []BillItem{
		{Name: "Tomatoes", Quantity: 2, Unit: "kg", ShelfLifeDays: 7},
		{Name: "Dishwasher Tablets", Quantity: 1, Unit: "pcs", ShelfLifeDays: 365},
		{Name: "Catch Jeera Whole", Quantity: 1, Unit: "pcs", ShelfLifeDays: 180},
	}

	matched, skipped := ApplyCatalogMapping(items)
	if len(matched) != 2 {
		t.Fatalf("expected 2 matched items, got %d: %+v", len(matched), matched)
	}
	if len(skipped) != 1 || skipped[0] != "Dishwasher Tablets" {
		t.Fatalf("expected dishwasher skipped, got %v", skipped)
	}
	if matched[0].Name != "Tomato" {
		t.Fatalf("expected Tomato canonical, got %q", matched[0].Name)
	}
	if matched[0].IngredientID == "" {
		t.Fatal("expected ingredient_id on matched tomato")
	}
	if matched[1].IngredientID == "" {
		t.Fatal("expected ingredient_id on matched jeera")
	}
}

func TestApplyCatalogMappingWesternBill(t *testing.T) {
	items := []BillItem{
		{Name: "Large Eggs", Quantity: 6, Unit: "pcs", ShelfLifeDays: 14},
		{Name: "Milk", Quantity: 1, Unit: "L", ShelfLifeDays: 7},
		{Name: "Cottage Cheese", Quantity: 1, Unit: "pcs", ShelfLifeDays: 7},
		{Name: "Natural Yogurt", Quantity: 1, Unit: "pcs", ShelfLifeDays: 7},
		{Name: "Cherry Tomatoes", Quantity: 1, Unit: "lb", ShelfLifeDays: 7},
		{Name: "Bananas", Quantity: 1, Unit: "pcs", ShelfLifeDays: 5},
		{Name: "Aubergine", Quantity: 1, Unit: "pcs", ShelfLifeDays: 7},
	}

	matched, skipped := ApplyCatalogMapping(items)
	if len(skipped) != 1 || skipped[0] != "Natural Yogurt" {
		t.Fatalf("expected Natural Yogurt skipped, got skipped=%v", skipped)
	}
	if len(matched) != 6 {
		t.Fatalf("expected 6 matched, got %d: %+v", len(matched), matched)
	}

	want := map[string]string{
		"Large Eggs":      "Egg",
		"Milk":            "Milk",
		"Cottage Cheese":  "Paneer",
		"Cherry Tomatoes": "Cherry",
		"Bananas":         "Banana",
		"Aubergine":       "Brinjal",
	}
	got := map[string]string{}
	for _, m := range matched {
		got[m.Name] = m.IngredientID
		if m.IngredientID == "" {
			t.Fatalf("%q missing ingredient_id", m.Name)
		}
	}
	for _, wantName := range want {
		if _, ok := got[wantName]; !ok {
			t.Fatalf("missing canonical %q in %+v", wantName, got)
		}
	}
}
