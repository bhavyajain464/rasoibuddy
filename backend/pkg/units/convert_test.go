package units

import "testing"

func TestConvertQty(t *testing.T) {
	tests := []struct {
		qty      float64
		from, to string
		want     float64
	}{
		{1, "kg", "g", 1000},
		{500, "g", "kg", 0.5},
		{2, "L", "ml", 2000},
		{3, "pcs", "pcs", 3},
	}
	for _, tc := range tests {
		got, err := ConvertQty(tc.qty, tc.from, tc.to)
		if err != nil {
			t.Fatalf("ConvertQty(%v,%s,%s): %v", tc.qty, tc.from, tc.to, err)
		}
		if got != tc.want {
			t.Fatalf("ConvertQty(%v,%s,%s) = %v, want %v", tc.qty, tc.from, tc.to, got, tc.want)
		}
	}
}
