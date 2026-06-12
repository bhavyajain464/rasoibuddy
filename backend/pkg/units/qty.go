package units

import "fmt"

// MaxQty is the largest allowed quantity per line (use kg/L instead of 1000 g/ml).
const MaxQty = 999

// ValidateQty rejects non-positive or unrealistically large pantry amounts.
func ValidateQty(qty float64) error {
	if qty <= 0 {
		return fmt.Errorf("qty must be positive")
	}
	if qty > MaxQty {
		return fmt.Errorf("qty cannot exceed %d — use a larger unit (e.g. 1000 g → 1 kg)", MaxQty)
	}
	return nil
}
