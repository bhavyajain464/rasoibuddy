package services

import "testing"

func TestDishBlockedByAllergenFlags(t *testing.T) {
	dairy := CatalogDish{Name: "Paneer Butter Masala", Allergens: []string{"dairy"}}
	gluten := CatalogDish{Name: "Aloo Paratha", Allergens: []string{"gluten"}}
	clean := CatalogDish{Name: "Lemon Rice", Allergens: nil}

	cases := []struct {
		name      string
		dish      CatalogDish
		allergies []string
		want      bool
	}{
		{"milk term -> dairy flag", dairy, []string{"milk"}, true},
		{"dairy term -> dairy flag", dairy, []string{"dairy"}, true},
		{"wheat term -> gluten flag", gluten, []string{"wheat"}, true},
		{"gluten term -> gluten flag", gluten, []string{"gluten"}, true},
		{"unrelated allergy passes", dairy, []string{"peanut"}, false},
		{"no allergens on dish passes", clean, []string{"dairy"}, false},
		{"no allergies passes", dairy, nil, false},
	}
	for _, c := range cases {
		if got := dishBlockedByAllergenFlags(c.dish, c.allergies); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestDishBlockedForJain(t *testing.T) {
	jainSafe := CatalogDish{Name: "Sabudana Khichdi", JainSafe: true}
	hasOnion := CatalogDish{Name: "Aloo Pyaz", JainSafe: false}

	if dishBlockedForJain(jainSafe, []string{"jain"}) {
		t.Error("jain-safe dish should not be blocked for jain user")
	}
	if !dishBlockedForJain(hasOnion, []string{"jain"}) {
		t.Error("onion/root dish should be blocked for jain user")
	}
	if dishBlockedForJain(hasOnion, []string{"vegetarian"}) {
		t.Error("non-jain user should not trigger jain filter")
	}
}

func TestSpiceMatchBoost(t *testing.T) {
	mildDish := CatalogDish{SpiceLevel: "mild"}
	spicyDish := CatalogDish{SpiceLevel: "spicy"}
	noMeta := CatalogDish{}

	if spiceMatchBoost(mildDish, "mild") <= 0 {
		t.Error("exact spice match should be rewarded")
	}
	if spiceMatchBoost(spicyDish, "mild") >= 0 {
		t.Error("opposite-end spice mismatch should be penalised")
	}
	if spiceMatchBoost(noMeta, "spicy") != 0 {
		t.Error("missing dish spice metadata should be neutral")
	}
	if spiceMatchBoost(spicyDish, "") != 0 {
		t.Error("no user preference should be neutral")
	}
}

func TestSampleRankedDishes(t *testing.T) {
	ranked := []RankedDish{
		{Dish: CatalogDish{Name: "A"}, Score: 10},
		{Dish: CatalogDish{Name: "B"}, Score: 8},
		{Dish: CatalogDish{Name: "C"}, Score: 6},
		{Dish: CatalogDish{Name: "D"}, Score: 4},
	}

	// Same seed => identical order (stable within a slot/day).
	a := SampleRankedDishes(ranked, 0.7, 12345)
	b := SampleRankedDishes(ranked, 0.7, 12345)
	if len(a) != len(ranked) || len(b) != len(ranked) {
		t.Fatalf("sampler must return all dishes, got %d/%d", len(a), len(b))
	}
	for i := range a {
		if a[i].Dish.Name != b[i].Dish.Name {
			t.Fatalf("same seed must be deterministic; diverged at %d", i)
		}
	}

	// Different seeds should (usually) produce a different ordering => variance.
	diff := false
	base := SampleRankedDishes(ranked, 0.9, 1)
	for s := int64(2); s < 12; s++ {
		o := SampleRankedDishes(ranked, 0.9, s)
		for i := range o {
			if o[i].Dish.Name != base[i].Dish.Name {
				diff = true
				break
			}
		}
		if diff {
			break
		}
	}
	if !diff {
		t.Error("expected ordering variance across seeds")
	}

	// Sampler must be a permutation (no dropped/duplicated dishes).
	seen := map[string]int{}
	for _, r := range a {
		seen[r.Dish.Name]++
	}
	if len(seen) != len(ranked) {
		t.Errorf("sampler changed the set: %v", seen)
	}
}
