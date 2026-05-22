package services

import (
	"math"
	"testing"
)

func TestCatalogRecencyWeightColdStart(t *testing.T) {
	d := CatalogDish{Name: "Khichdi", HalfLifeDays: 5}
	if got := CatalogRecencyWeight(d, -1); got != 1.0 {
		t.Fatalf("never exposed should be 1.0, got %v", got)
	}
}

func TestCatalogRecencyWeightExponentialDecay(t *testing.T) {
	d := CatalogDish{Name: "Khichdi", HalfLifeDays: 5}
	w0 := CatalogRecencyWeight(d, 0)
	if w0 != 0.0 {
		t.Fatalf("cooked today should be 0, got %v", w0)
	}
	w5 := CatalogRecencyWeight(d, 5)
	want5 := 1.0 - math.Exp(-1.0)
	if math.Abs(w5-want5) > 0.001 {
		t.Fatalf("at half-life want ~%v, got %v", want5, w5)
	}
	w10 := CatalogRecencyWeight(d, 10)
	if w10 <= w5 || w10 > 1.0 {
		t.Fatalf("weight should increase with days: w5=%v w10=%v", w5, w10)
	}
}

func TestDaysSinceLastExposure(t *testing.T) {
	d := CatalogDish{Name: "Dal"}
	cooked := map[string]int{NormalizeDishName("Dal"): 7}
	suggested := map[string]int{NormalizeDishName("Dal"): 2}
	if got := DaysSinceLastExposure(d, cooked, suggested); got != 2 {
		t.Fatalf("expected most recent exposure 2 days, got %d", got)
	}
	if got := DaysSinceLastExposure(d, nil, nil); got != -1 {
		t.Fatalf("expected -1 for cold start, got %d", got)
	}
}

func TestEffectiveHalfLifeFromFrequencyClass(t *testing.T) {
	d := CatalogDish{FrequencyClass: "weekly"}
	if got := d.effectiveHalfLifeDays(); got != 10 {
		t.Fatalf("expected 10, got %v", got)
	}
}
