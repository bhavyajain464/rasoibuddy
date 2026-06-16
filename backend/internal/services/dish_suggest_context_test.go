package services

import (
	"testing"
	"time"
)

func TestDeriveSuggestionContextWeekday(t *testing.T) {
	loc, _ := time.LoadLocation(suggestTimezone)
	tue := time.Date(2026, 5, 19, 18, 0, 0, 0, loc) // Tuesday 6pm IST
	ctx := DeriveSuggestionContext(tue, "daily")
	if !ctx.WeekdayMode {
		t.Fatal("expected weekday mode on Tuesday")
	}
	if ctx.MaxCookMins != 40 {
		t.Fatalf("expected max 40 min, got %d", ctx.MaxCookMins)
	}
	if ctx.AllowHighEff {
		t.Fatal("high effort should not be allowed on weekday")
	}
}

func TestDeriveSuggestionContextWeekend(t *testing.T) {
	loc, _ := time.LoadLocation(suggestTimezone)
	sat := time.Date(2026, 5, 23, 12, 0, 0, 0, loc)
	ctx := DeriveSuggestionContext(sat, "daily")
	if ctx.WeekdayMode {
		t.Fatal("expected weekend mode")
	}
	if !ctx.AllowHighEff {
		t.Fatal("weekend should allow high effort")
	}
}

func TestDishMatchesSuggestionContext(t *testing.T) {
	weeknight := CatalogDish{
		Name:            "Khichdi",
		Effort:          "low",
		CookTimeMinutes: 25,
		WeekdayFriendly: true,
	}
	fancy := CatalogDish{
		Name:            "Biryani",
		Effort:          "high",
		CookTimeMinutes: 90,
		WeekdayFriendly: false,
	}
	ctx := SuggestionContext{WeekdayMode: true, MaxCookMins: 40, AllowHighEff: false}
	if !DishMatchesSuggestionContext(weeknight, ctx) {
		t.Fatal("khichdi should match weekday context")
	}
	if DishMatchesSuggestionContext(fancy, ctx) {
		t.Fatal("long high-effort dish should not match weekday context")
	}
}

func TestRetrieveDishesUsesWeekdayContext(t *testing.T) {
	requireSeededCatalog(t)
	loc, _ := time.LoadLocation(suggestTimezone)
	tue := time.Date(2026, 5, 19, 18, 0, 0, 0, loc)
	in := DishRetrieveInput{
		Category:    "daily",
		DietaryTags: []string{"vegetarian"},
		TopK:        30,
		Now:         tue,
	}
	ranked := RetrieveDishes(in)
	if len(ranked) == 0 {
		t.Fatal("expected candidates")
	}
	for _, r := range ranked {
		if r.Dish.HasPracticalMeta() && !r.Dish.WeekdayFriendly {
			t.Fatalf("weekday daily should not surface non-weekday dish: %s", r.Dish.Name)
		}
		if r.Dish.CookTimeMinutes > 40 {
			t.Fatalf("weekday daily should respect cook time: %s (%d min)", r.Dish.Name, r.Dish.CookTimeMinutes)
		}
	}
}
