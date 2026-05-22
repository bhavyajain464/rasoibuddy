package services

import (
	"math"
	"strings"
)

// CatalogRecencyWeight returns a score multiplier in [0,1] from catalog half-life decay.
// daysSinceLastExposure == -1 means never cooked/suggested (cold start → no penalty).
func CatalogRecencyWeight(dish CatalogDish, daysSinceLastExposure int) float64 {
	if daysSinceLastExposure < 0 {
		return 1.0
	}
	halfLife := dish.effectiveHalfLifeDays()
	if halfLife <= 0 {
		return 1.0
	}
	return 1.0 - math.Exp(-float64(daysSinceLastExposure)/halfLife)
}

func (d CatalogDish) effectiveHalfLifeDays() float64 {
	if d.HalfLifeDays > 0 {
		return float64(d.HalfLifeDays)
	}
	switch strings.ToLower(strings.TrimSpace(d.FrequencyClass)) {
	case "daily":
		return 5
	case "weekly":
		return 10
	case "special":
		return 14
	default:
		return 7
	}
}

// DaysSinceLastExposure is the minimum days since the user ate or was shown this dish.
// Returns -1 when there is no recorded exposure.
func DaysSinceLastExposure(dish CatalogDish, cookedDays, suggestedDays map[string]int) int {
	key := catalogDishKey(dish)
	days := -1
	if cookedDays != nil {
		if d, ok := cookedDays[key]; ok {
			days = d
		}
	}
	if suggestedDays != nil {
		if d, ok := suggestedDays[key]; ok {
			if days < 0 || d < days {
				days = d
			}
		}
	}
	return days
}

func catalogDishKey(dish CatalogDish) string {
	return NormalizeDishName(dish.Name)
}
