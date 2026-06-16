package services

import "testing"

func TestMatchDishToInventory(t *testing.T) {
	requireSeededCatalog(t)
	dish, ok := FindCatalogDishByID("aloo-matar")
	if !ok {
		t.Skip("aloo-matar not in seeded catalog")
	}
	have := BuildHaveIngredientSet([]string{"potato", "onion", "tomato"}, nil)
	m := MatchDishToInventory(dish, have)

	hasAll := func(got []string, want ...string) bool {
		set := map[string]bool{}
		for _, g := range got {
			set[g] = true
		}
		for _, w := range want {
			if !set[w] {
				return false
			}
		}
		return true
	}

	if len(m.Have) < 2 {
		t.Errorf("expected pantry matches in Have, got %v", m.Have)
	}
	if len(m.Staples) == 0 {
		t.Errorf("expected staple ingredients, got staples=%v", m.Staples)
	}
	if m.Coverage <= 0 {
		t.Errorf("expected positive coverage, got %v", m.Coverage)
	}
	_ = hasAll
}

func TestInventoryItemsUsedByDishMatchesPantryNames(t *testing.T) {
	dish := CatalogDish{KeyIngredients: []string{"potato", "onion"}}
	used := InventoryItemsUsedByDish(dish, []string{"Potato", "Carrot"})
	if len(used) != 1 || used[0] != "Potato" {
		t.Fatalf("expected Potato used, got %v", used)
	}
}

func TestShoppingListHasItem(t *testing.T) {
	requireSeededCatalog(t)
	list := []string{"Onion", "Tomato"}
	if !ShoppingListHasItem("onion", list) {
		t.Fatal("expected onion to match Onion on shopping list")
	}
	if ShoppingListHasItem("Potato", list) {
		t.Fatal("potato should not match onion/tomato list")
	}
	if !ShoppingListHasItem("Green Cardamom", []string{"Cardamom"}) {
		t.Fatal("green cardamom should match cardamom on list for dedup")
	}
}

func TestMatchDishToInventoryWordAware(t *testing.T) {
	requireSeededCatalog(t)
	dish, ok := FindCatalogDishByID("paneer-butter-masala")
	if !ok {
		t.Skip("paneer-butter-masala not in seeded catalog")
	}
	have := BuildHaveIngredientSet(nil, []string{"Chilli Powder"})
	m := MatchDishToInventory(dish, have)
	if len(m.Have) == 0 && len(m.Staples) == 0 {
		t.Errorf("expected some ingredient overlap, got have=%v missing=%v", m.Have, m.Missing)
	}
}
