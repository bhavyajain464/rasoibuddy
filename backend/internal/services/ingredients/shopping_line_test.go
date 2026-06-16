package ingredients

import "testing"

func TestNormalizeShoppingLineBayLeaf(t *testing.T) {
	requireSeededCatalog(t)
	name, qty, unit := NormalizeShoppingLine("Bay leaf", 0, "pcs")
	if name != "Bay Leaf" {
		t.Fatalf("name = %q, want Bay Leaf", name)
	}
	if unit != "g" {
		t.Fatalf("unit = %q, want g", unit)
	}
	if qty <= 0 {
		t.Fatalf("qty = %v, want positive default", qty)
	}
}

func TestNormalizeShoppingLineLemon(t *testing.T) {
	requireSeededCatalog(t)
	name, qty, unit := NormalizeShoppingLine("lemon", 0, "pcs")
	if name != "Lemon" {
		t.Fatalf("name = %q, want Lemon", name)
	}
	if unit != "pcs" {
		t.Fatalf("unit = %q, want pcs", unit)
	}
	if qty != 2 {
		t.Fatalf("qty = %v, want 2", qty)
	}
}

func TestNormalizeShoppingLineUnknownStillGetsQty(t *testing.T) {
	_, qty, unit := NormalizeShoppingLine("Mystery Item", 0, "pcs")
	if unit != "pcs" {
		t.Fatalf("unit = %q", unit)
	}
	if qty != 2 {
		t.Fatalf("qty = %v, want 2 for unknown pcs lines", qty)
	}
}
