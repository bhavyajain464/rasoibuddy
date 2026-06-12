package units

import "testing"

func TestValidateQty(t *testing.T) {
	if err := ValidateQty(1); err != nil {
		t.Fatalf("1 should be valid: %v", err)
	}
	if err := ValidateQty(999); err != nil {
		t.Fatalf("999 should be valid: %v", err)
	}
	if err := ValidateQty(1000); err == nil {
		t.Fatal("1000 should be rejected")
	}
	if err := ValidateQty(0); err == nil {
		t.Fatal("0 should be rejected")
	}
}
