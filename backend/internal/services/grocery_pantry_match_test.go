package services

import "testing"

func TestItemCoveredByPantry_AttaCoversRoti(t *testing.T) {
	pantry := []string{"Atta", "onion", "tomato"}
	for _, item := range []string{"roti", "rotis", "chapati", "paratha", "naan"} {
		if !itemCoveredByPantry(item, pantry) {
			t.Errorf("expected %q covered when atta in pantry", item)
		}
	}
}

func TestItemCoveredByPantry_OnionNotCoveredByTomato(t *testing.T) {
	pantry := []string{"tomato"}
	if itemCoveredByPantry("onion", pantry) {
		t.Error("onion should not be covered by tomato only")
	}
}
