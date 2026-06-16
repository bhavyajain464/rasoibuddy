package services

import "testing"

func TestGroceryIngredientLines_dropsDishTitles(t *testing.T) {
	lines := GroceryIngredientLines([]string{"onion", "Jeera Rice", "tomato"})
	if len(lines) != 2 {
		t.Fatalf("got %v", lines)
	}
}

func TestGroceryIngredientLines_keepsSingleIngredientDish(t *testing.T) {
	lines := GroceryIngredientLines([]string{"papad", "onion"})
	if len(lines) != 2 {
		t.Fatalf("got %v", lines)
	}
}
