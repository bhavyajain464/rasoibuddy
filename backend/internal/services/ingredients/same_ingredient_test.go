package ingredients

import "testing"

func TestSameIngredientCatalogSynonym(t *testing.T) {
	if !SameIngredient("cardamom", "Green Cardamom") {
		t.Fatal("synonym cardamom should match Green Cardamom catalog row")
	}
}

func TestSameIngredientDifferentItems(t *testing.T) {
	if SameIngredient("Onion", "Potato") {
		t.Fatal("onion and potato should not match")
	}
}

func TestSameIngredientCaseInsensitive(t *testing.T) {
	if !SameIngredient("onion", "Onion") {
		t.Fatal("onion should match Onion")
	}
}
