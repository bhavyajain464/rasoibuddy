package services

import "testing"

func TestMatchDishToInventory(t *testing.T) {
	dish := CatalogDish{
		Name:           "Aloo Matar",
		KeyIngredients: []string{"potato", "green peas", "onion", "tomato", "turmeric powder", "salt", "cooking oil"},
	}
	inv := []string{"Potato", "Onion", "Tomato"}

	m := MatchDishToInventory(dish, inv)

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

	if !hasAll(m.Have, "potato", "onion", "tomato") {
		t.Errorf("expected potato/onion/tomato in Have, got %v", m.Have)
	}
	// green peas not in inventory and not a staple -> shopping-worthy missing
	if !hasAll(m.Missing, "green peas") {
		t.Errorf("expected green peas in Missing, got %v", m.Missing)
	}
	// salt / oil / turmeric are assumed staples, not shopping-worthy
	if !hasAll(m.Staples, "salt", "cooking oil", "turmeric powder") {
		t.Errorf("expected staples to be excluded from Missing, got staples=%v missing=%v", m.Staples, m.Missing)
	}
	for _, mm := range m.Missing {
		if mm == "salt" || mm == "cooking oil" {
			t.Errorf("staple %q must not be in Missing", mm)
		}
	}
	// coverage = have / (have+missing) ignoring staples = 3 / (3+1)
	if m.Coverage < 0.74 || m.Coverage > 0.76 {
		t.Errorf("expected coverage ~0.75, got %v", m.Coverage)
	}
}

func TestMatchDishToInventoryWordAware(t *testing.T) {
	dish := CatalogDish{KeyIngredients: []string{"red chilli powder", "paneer"}}
	// inventory has a looser name that should still match red chilli powder
	m := MatchDishToInventory(dish, []string{"Chilli Powder"})
	found := false
	for _, h := range m.Have {
		if h == "red chilli powder" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected 'red chilli powder' matched by inventory 'Chilli Powder', got have=%v missing=%v", m.Have, m.Missing)
	}
}
