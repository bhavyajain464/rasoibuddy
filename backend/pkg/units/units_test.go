package units

import "testing"

func TestNormalize(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", "pcs"},
		{"pieces", "pcs"},
		{"pack", "pcs"},
		{"PCS", "pcs"},
		{"kg", "kg"},
		{"grams", "g"},
		{"liter", "L"},
		{"l", "L"},
		{"ml", "ml"},
	}
	for _, tc := range tests {
		if got := Normalize(tc.in); got != tc.want {
			t.Errorf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
