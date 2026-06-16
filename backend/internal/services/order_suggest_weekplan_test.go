package services

import (
	"strings"
	"testing"
)

func TestSuggestOrderItemsFromWeekPlan_TopMissingIngredients(t *testing.T) {
	plan := &WeekPlanEntry{
		Days: []WeekPlanDay{
			{
				Date: "2026-06-13",
				Category: CachedMealCategory{
					Meals: []CachedSmartMeal{
						{Name: "Dal Tadka", Ingredients: []string{"toor dal", "onion", "tomato"}, ItemsToOrder: []string{"onion", "tomato"}},
						{Name: "Jeera Rice", Ingredients: []string{"rice", "cumin seeds", "ghee"}},
					},
				},
			},
			{
				Date: "2026-06-14",
				Category: CachedMealCategory{
					Meals: []CachedSmartMeal{
						{Name: "Dal Tadka", Ingredients: []string{"toor dal", "onion", "tomato"}, ItemsToOrder: []string{"onion", "tomato"}},
					},
				},
			},
		},
	}

	in := OrderSuggestInput{
		WeekPlan:     plan,
		Inventory:    []string{"rice", "toor dal"},
		ShoppingList: []string{"ghee"},
	}
	result, err := SuggestOrderItemsFromWeekPlan(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Source != "week_plan" {
		t.Fatalf("expected week_plan source, got %q", result.Source)
	}
	if len(result.Items) < 2 {
		t.Fatalf("expected at least 2 missing items, got %d: %+v", len(result.Items), result.Items)
	}
	names := map[string]bool{}
	for _, item := range result.Items {
		names[strings.ToLower(item.Name)] = true
	}
	for _, want := range []string{"onion", "tomato"} {
		found := false
		for n := range names {
			if strings.Contains(n, want) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected missing ingredient %q in suggestions, got %+v", want, result.Items)
		}
	}
	for _, blocked := range []string{"rice", "toor dal", "ghee"} {
		if names[blocked] {
			t.Errorf("should not suggest covered ingredient %q", blocked)
		}
	}
}

func TestSuggestOrderItemsFromWeekPlan_CacheCapAt12(t *testing.T) {
	ings := []string{
		"paneer", "cream", "capsicum", "coriander leaves", "onion", "tomato",
		"potato", "green peas", "cauliflower", "spinach", "ginger", "garlic",
		"curd", "besan", "mushroom",
	}
	meals := make([]CachedSmartMeal, 0, len(ings))
	for _, ing := range ings {
		meals = append(meals, CachedSmartMeal{
			Name:         "Custom Dish",
			ItemsToOrder: []string{ing},
		})
	}
	plan := &WeekPlanEntry{
		Days: []WeekPlanDay{{
			Date:     "2026-06-13",
			Category: CachedMealCategory{Meals: meals},
		}},
	}
	result, err := SuggestOrderItemsFromWeekPlan(OrderSuggestInput{WeekPlan: plan})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) != OrderSuggestCacheSize {
		t.Fatalf("expected %d cached suggestions, got %d", OrderSuggestCacheSize, len(result.Items))
	}
}

func TestSuggestOrderItemsFromWeekPlan_NoPlan(t *testing.T) {
	_, err := SuggestOrderItemsFromWeekPlan(OrderSuggestInput{})
	if err == nil {
		t.Fatal("expected error for missing week plan")
	}
}

func TestSuggestOrderItemsFromWeekPlan_UsesItemsToOrder(t *testing.T) {
	plan := &WeekPlanEntry{
		Days: []WeekPlanDay{
			{
				Date: "2026-06-13",
				Category: CachedMealCategory{
					Meals: []CachedSmartMeal{
						{
							Name:         "Paneer Butter Masala",
							Ingredients:  []string{"paneer", "tomato", "onion", "cream", "butter"},
							ItemsToOrder:   []string{"paneer", "cream"},
							MealSlot:     "dinner",
						},
					},
				},
			},
		},
	}
	result, err := SuggestOrderItemsFromWeekPlan(OrderSuggestInput{
		WeekPlan:  plan,
		Inventory: []string{"tomato", "onion", "butter"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) < 2 {
		t.Fatalf("expected at least 2 items from catalog dish, got %d: %+v", len(result.Items), result.Items)
	}
	names := map[string]bool{}
	for _, item := range result.Items {
		names[strings.ToLower(item.Name)] = true
	}
	for _, want := range []string{"paneer", "cream"} {
		found := false
		for n := range names {
			if strings.Contains(n, want) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected %q in suggestions, got %+v", want, result.Items)
		}
	}
}

func TestSuggestOrderItemsFromWeekPlan_CatalogUnits(t *testing.T) {
	plan := &WeekPlanEntry{
		Days: []WeekPlanDay{
			{
				Date: "2026-06-13",
				Category: CachedMealCategory{
					Meals: []CachedSmartMeal{
						{Name: "Garam Masala Rice", Ingredients: []string{"cardamom", "bay leaf", "rice"}},
					},
				},
			},
		},
	}
	result, err := SuggestOrderItemsFromWeekPlan(OrderSuggestInput{
		WeekPlan:  plan,
		Inventory: []string{"rice"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var cardamom *OrderSuggestItem
	var bayLeaf *OrderSuggestItem
	for i := range result.Items {
		if strings.EqualFold(result.Items[i].Name, "Green Cardamom") {
			cardamom = &result.Items[i]
		}
		if strings.EqualFold(result.Items[i].Name, "Bay Leaf") {
			bayLeaf = &result.Items[i]
		}
	}
	if cardamom == nil {
		t.Fatalf("expected Green Cardamom suggestion, got %+v", result.Items)
	}
	if cardamom.Unit != "g" {
		t.Fatalf("expected g for cardamom, got %q", cardamom.Unit)
	}
	if cardamom.Qty <= 0 {
		t.Fatalf("expected positive default qty for cardamom, got %v", cardamom.Qty)
	}
	if bayLeaf == nil {
		t.Fatalf("expected Bay Leaf suggestion, got %+v", result.Items)
	}
	if bayLeaf.Unit != "g" {
		t.Fatalf("expected g for bay leaf, got %q", bayLeaf.Unit)
	}
	if bayLeaf.Qty <= 0 {
		t.Fatalf("expected positive default qty for bay leaf, got %v", bayLeaf.Qty)
	}
}
