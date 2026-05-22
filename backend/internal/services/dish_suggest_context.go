package services

import (
	"strings"
	"time"
)

const suggestTimezone = "Asia/Kolkata"

// SuggestionContext drives weekday vs weekend filtering for smart meals.
type SuggestionContext struct {
	WeekdayMode  bool // Mon–Fri (or weekday evening)
	MaxCookMins  int
	AllowHighEff bool
}

// DeriveSuggestionContext picks practical filters from local time and UI category.
func DeriveSuggestionContext(now time.Time, category string) SuggestionContext {
	loc, err := time.LoadLocation(suggestTimezone)
	if err != nil {
		loc = time.FixedZone("IST", 5*3600+30*60)
	}
	t := now.In(loc)
	weekend := t.Weekday() == time.Saturday || t.Weekday() == time.Sunday

	ctx := SuggestionContext{
		WeekdayMode:  !weekend,
		MaxCookMins:  90,
		AllowHighEff: weekend,
	}
	if weekend {
		return ctx
	}

	ctx.MaxCookMins = 40
	ctx.AllowHighEff = false
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "long_lasting":
		ctx.MaxCookMins = 60
	case "most_tasty":
		ctx.MaxCookMins = 50
	case "most_healthy":
		ctx.MaxCookMins = 45
	case "rescue_meal", "meal_of_day":
		ctx.MaxCookMins = 35
	case "daily", "":
		ctx.MaxCookMins = 40
	}
	return ctx
}

// DishMatchesSuggestionContext applies catalog effort / time / weekday flags.
// Dishes missing optional fields pass through (backward compatible).
func DishMatchesSuggestionContext(d CatalogDish, ctx SuggestionContext) bool {
	if ctx.WeekdayMode && d.HasPracticalMeta() && !d.WeekdayFriendly {
		return false
	}
	if ctx.MaxCookMins > 0 && d.CookTimeMinutes > 0 && d.CookTimeMinutes > ctx.MaxCookMins {
		return false
	}
	eff := strings.ToLower(strings.TrimSpace(d.Effort))
	if eff == "high" && !ctx.AllowHighEff {
		return false
	}
	return true
}

// RelaxedSuggestionContext widens cook-time only (keeps weekday_friendly on weekdays).
func RelaxedSuggestionContext(ctx SuggestionContext) SuggestionContext {
	ctx.MaxCookMins += 20
	return ctx
}

// CatalogContextBoost nudges retrieval toward practical weeknight dishes.
func CatalogContextBoost(dish CatalogDish, ctx SuggestionContext, category string) float64 {
	var boost float64
	if ctx.WeekdayMode && dish.WeekdayFriendly {
		boost += 2.5
	}
	switch strings.ToLower(strings.TrimSpace(dish.Effort)) {
	case "low":
		if ctx.WeekdayMode {
			boost += 1.8
		}
	case "medium":
		if ctx.WeekdayMode {
			boost += 0.6
		}
	}
	if dish.OnePot {
		cat := strings.ToLower(strings.TrimSpace(category))
		if cat == "rescue_meal" || cat == "meal_of_day" || cat == "daily" {
			boost += 1.2
		}
	}
	if dish.CookTimeMinutes > 0 && ctx.MaxCookMins > 0 && dish.CookTimeMinutes <= ctx.MaxCookMins/2 {
		boost += 0.8
	}
	return boost
}
