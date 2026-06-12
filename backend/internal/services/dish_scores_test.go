package services

import "testing"

func TestCategoryStyleBoostUsesScores(t *testing.T) {
	healthy := CatalogDish{Name: "Sprout Salad", HealthyScore: 92, TastyScore: 40}
	junk := CatalogDish{Name: "Gulab Jamun", HealthyScore: 10, TastyScore: 92}

	// most_healthy must favour the high healthy_score dish.
	if uiCategoryStyleBoost(healthy, "most_healthy") <= uiCategoryStyleBoost(junk, "most_healthy") {
		t.Error("most_healthy should rank the higher healthy_score dish above the lower one")
	}
	// most_tasty must favour the high tasty_score dish.
	if uiCategoryStyleBoost(junk, "most_tasty") <= uiCategoryStyleBoost(healthy, "most_tasty") {
		t.Error("most_tasty should rank the higher tasty_score dish above the lower one")
	}
	// 0-100 maps into a bounded 0-4 boost.
	if got := uiCategoryStyleBoost(healthy, "most_healthy"); got < 3.6 || got > 3.7 {
		t.Errorf("expected ~3.68 boost for healthy_score 92, got %v", got)
	}
}

func TestCategoryStyleBoostFallsBackWithoutScore(t *testing.T) {
	// A dish with no score still gets the legacy heuristic (non-zero), not a crash.
	d := CatalogDish{Name: "Dal Tadka", Diet: "vegan"}
	if uiCategoryStyleBoost(d, "most_healthy") <= 0 {
		t.Error("expected fallback heuristic boost when healthy_score is unset")
	}
}
