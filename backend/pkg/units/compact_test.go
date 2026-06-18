package units

import "testing"

func TestCompactQtyUnit(t *testing.T) {
	tests := []struct {
		qty, wantQty float64
		unit, wantUnit string
	}{
		{500, 500, "g", "g"},
		{1000, 1, "g", "kg"},
		{1500, 1.5, "g", "kg"},
		{1_500_000, 1500, "g", "kg"},
		{2000, 2, "ml", "L"},
		{50, 50, "pcs", "pcs"},
		{1500, 1500, "pcs", "pcs"},
		{2, 2, "kg", "kg"},
	}
	for _, tc := range tests {
		gotQty, gotUnit := CompactQtyUnit(tc.qty, tc.unit)
		if gotQty != tc.wantQty || gotUnit != tc.wantUnit {
			t.Fatalf("CompactQtyUnit(%v, %q) = (%v, %q), want (%v, %q)",
				tc.qty, tc.unit, gotQty, gotUnit, tc.wantQty, tc.wantUnit)
		}
	}
}

func TestNormalizeStoredQtyRejectsOversizedPcs(t *testing.T) {
	_, _, err := NormalizeStoredQty(1500, "pcs")
	if err == nil {
		t.Fatal("expected error for 1500 pcs")
	}
}
