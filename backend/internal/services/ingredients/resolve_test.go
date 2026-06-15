package ingredients

import "testing"

func TestResolveSynonym(t *testing.T) {
	match, ok := Resolve("aloo")
	if !ok || match.Ingredient.IngredientID != "potato" {
		t.Fatalf("expected potato from aloo, got %+v ok=%v", match, ok)
	}
}

func TestResolveCanonicalCaseInsensitive(t *testing.T) {
	match, ok := Resolve("potato")
	if !ok || match.Ingredient.Name != "Potato" {
		t.Fatalf("expected Potato, got %+v", match)
	}
}

func TestResolveRegionalSynonym(t *testing.T) {
	match, ok := Resolve("tej patta")
	if !ok || match.Ingredient.IngredientID != "bay_leaf" {
		t.Fatalf("expected bay_leaf, got %+v ok=%v", match, ok)
	}
}

func TestResolveUnknown(t *testing.T) {
	_, ok := Resolve("totally unknown ingredient xyz123")
	if ok {
		t.Fatal("expected no match for unknown ingredient")
	}
}

func TestInventoryFieldsFromNameOnboardingStaple(t *testing.T) {
	name, group := InventoryFieldsFromName("Wheat Flour (Atta)")
	if name != "Wheat Flour" {
		t.Fatalf("expected Wheat Flour, got %q", name)
	}
	if group == "" || group == "other" {
		t.Fatalf("expected catalog food_group, got %q", group)
	}
}

func TestInventoryFieldsFromNameUnknown(t *testing.T) {
	name, group := InventoryFieldsFromName("Mystery Item")
	if name != "Mystery Item" || group != "other" {
		t.Fatalf("expected passthrough with other, got %q %q", name, group)
	}
}
