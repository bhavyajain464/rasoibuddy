package services

import "testing"

func TestExpandCompoundGrocery_MixedVegetables(t *testing.T) {
	got := expandCompoundGrocery("mixed vegetables")
	if len(got) < 4 {
		t.Fatalf("expected multiple vegetables, got %v", got)
	}
}

func TestExpandOrderSuggestNames_BlocksMixedVegetables(t *testing.T) {
	got := expandOrderSuggestNames("Mixed vegetables")
	if len(got) == 0 {
		t.Fatal("expected expansion into individual vegetables")
	}
	for _, n := range got {
		if isBlockedShoppingName(n) {
			t.Fatalf("blocked name in output: %q", n)
		}
	}
}

func TestExpandOrderSuggestNames_KeepsOnion(t *testing.T) {
	got := expandOrderSuggestNames("onion")
	if len(got) != 1 || got[0] != "Onion" {
		t.Fatalf("expected single onion, got %v", got)
	}
}
