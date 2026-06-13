package ingredients

import "testing"

func TestNormalizeShoppingLineBayLeaf(t *testing.T) {
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

func TestNormalizeShoppingLineUnknownStillGetsQty(t *testing.T) {
	_, qty, unit := NormalizeShoppingLine("Mystery Item", 0, "pcs")
	if unit != "pcs" {
		t.Fatalf("unit = %q", unit)
	}
	if qty <= 0 {
		t.Fatalf("qty = %v, want default for unknown lines", qty)
	}
}
