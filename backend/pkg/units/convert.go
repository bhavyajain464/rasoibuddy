package units

import "fmt"

// ConvertQty converts qty between compatible canonical units (g/kg, ml/L, pcs/pcs).
func ConvertQty(qty float64, fromUnit, toUnit string) (float64, error) {
	from := Normalize(fromUnit)
	to := Normalize(toUnit)
	if from == to {
		return qty, nil
	}
	fromDim := unitDimension(from)
	toDim := unitDimension(to)
	if fromDim == "" || fromDim != toDim {
		return 0, fmt.Errorf("incompatible units: %s -> %s", from, to)
	}
	switch fromDim {
	case "mass":
		fromG := qty
		if from == "kg" {
			fromG = qty * 1000
		}
		if to == "kg" {
			return fromG / 1000, nil
		}
		return fromG, nil
	case "volume":
		fromMl := qty
		if from == "L" {
			fromMl = qty * 1000
		}
		if to == "L" {
			return fromMl / 1000, nil
		}
		return fromMl, nil
	case "count":
		return qty, nil
	default:
		return 0, fmt.Errorf("unsupported unit conversion: %s -> %s", from, to)
	}
}

// Compatible reports whether two units share the same dimension (mass, volume, or count).
func Compatible(a, b string) bool {
	da := unitDimension(Normalize(a))
	db := unitDimension(Normalize(b))
	return da != "" && da == db
}

func unitDimension(u string) string {
	switch u {
	case "g", "kg":
		return "mass"
	case "ml", "L":
		return "volume"
	case "pcs":
		return "count"
	default:
		return ""
	}
}
