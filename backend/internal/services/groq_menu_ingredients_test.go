package services

import "testing"

func TestParseMenuDishIngredientsJSON(t *testing.T) {
	raw := `[{"name":"Dal Fry","ingredients":["toor dal","onion","tomato","turmeric"]}]`
	rows, err := parseMenuDishIngredientsJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Name != "Dal Fry" || len(rows[0].Ingredients) != 4 {
		t.Fatalf("unexpected rows: %+v", rows)
	}
}

func TestNormalizeMenuDishName(t *testing.T) {
	if got := NormalizeMenuDishName("Paneer Butter Masala"); got != "paneer butter masala" {
		t.Fatalf("got %q", got)
	}
}
