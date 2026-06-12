package ingredients

import "testing"

func TestCatalogLoads(t *testing.T) {
	items := Catalog()
	if len(items) < 500 {
		t.Fatalf("expected at least 500 ingredients, got %d", len(items))
	}
}

func TestSearchBySynonym(t *testing.T) {
	items := Search("tej patta")
	if len(items) == 0 {
		t.Fatal("expected match for tej patta")
	}
	found := false
	for _, item := range items {
		if item.IngredientID == "bay_leaf" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected bay_leaf in results, got %v", items)
	}
}

func TestDefaultUnitForCategory(t *testing.T) {
	if got := defaultUnitForCategory("vegetables"); got != "kg" {
		t.Fatalf("vegetables -> kg, got %s", got)
	}
	if got := defaultUnitForCategory("spices"); got != "g" {
		t.Fatalf("spices -> g, got %s", got)
	}
	if got := defaultUnitForCategory("eggs"); got != "pcs" {
		t.Fatalf("eggs -> pcs, got %s", got)
	}
}
