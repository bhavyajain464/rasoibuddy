package services

import (
	"strings"
	"testing"
)

func TestFindCatalogDishByPairLabel_rotiChapati(t *testing.T) {
	requireSeededCatalog(t)
	d, ok := FindCatalogDishByPairLabel("roti / chapati")
	if !ok {
		t.Fatal("expected match for roti / chapati")
	}
	ings := d.CatalogIngredients()
	if len(ings) == 0 {
		t.Fatal("expected ingredients")
	}
	found := false
	for _, ing := range ings {
		if strings.Contains(strings.ToLower(ing), "wheat") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected whole wheat flour in %v", ings)
	}
}

func TestFindCatalogDishByPairLabel_slug(t *testing.T) {
	requireSeededCatalog(t)
	d, ok := FindCatalogDishByPairLabel("dal-tadka")
	if !ok {
		t.Fatal("expected dal-tadka match")
	}
	if d.ID != "dal-tadka" {
		t.Fatalf("got id %q", d.ID)
	}
}

func TestCatalogIngredientsForPairLabel_papad(t *testing.T) {
	requireSeededCatalog(t)
	ings := CatalogIngredientsForPairLabel("papad")
	if len(ings) != 1 || !strings.EqualFold(ings[0], "papad") {
		t.Fatalf("got %v", ings)
	}
}

func TestPairIngredientsMap(t *testing.T) {
	requireSeededCatalog(t)
	m := PairIngredientsMap([]string{"roti / chapati", "papad"})
	if len(m) != 2 {
		t.Fatalf("got %d entries", len(m))
	}
	rotiKey := PairDisplayLabel("roti / chapati")
	if len(m[rotiKey]) == 0 {
		t.Fatalf("expected roti/chapati ingredients under %q, got keys %v", rotiKey, m)
	}
	papadKey := PairDisplayLabel("papad")
	if len(m[papadKey]) != 1 {
		t.Fatalf("papad: %v", m[papadKey])
	}
}
