package units

import "math"

// CompactQtyUnit promotes g→kg and ml→L while qty exceeds MaxQty.
// kg, L, and pcs are left unchanged when no smaller unit applies.
func CompactQtyUnit(qty float64, unit string) (float64, string) {
	unit = Normalize(unit)
	q := qty
	for q > MaxQty {
		switch unit {
		case "g":
			q = q / 1000
			unit = "kg"
		case "ml":
			q = q / 1000
			unit = "L"
		default:
			return roundQty(q), unit
		}
	}
	return roundQty(q), unit
}

// NormalizeStoredQty compacts then validates a pantry/shopping line qty.
func NormalizeStoredQty(qty float64, unit string) (float64, string, error) {
	q, u := CompactQtyUnit(qty, unit)
	if err := ValidateQty(q); err != nil {
		return 0, "", err
	}
	return q, u, nil
}

func roundQty(qty float64) float64 {
	if math.IsNaN(qty) || math.IsInf(qty, 0) {
		return 0
	}
	return math.Round(qty*100) / 100
}
