package services

import (
	"strings"
	"testing"
)

func TestExportIngredientsToRecipe(t *testing.T) {
	ings := exportIngredientsToRecipe([]MenuExportIngredient{
		{IngredientName: "toor dal", Qty: 80, Unit: "g"},
	}, nil)
	if len(ings) != 1 || ings[0].IngredientName != "toor dal" || ings[0].Qty != 80 {
		t.Fatalf("unexpected: %+v", ings)
	}
}

func TestFormatAndParseIngredientsCell(t *testing.T) {
	original := []MenuExportIngredient{
		{IngredientName: "toor dal", Qty: 80, Unit: "g"},
		{IngredientName: "onion", Qty: 50, Unit: "g"},
	}
	cell := formatIngredientsCell(original)
	want := "toor dal 80 g, onion 50 g"
	if cell != want {
		t.Fatalf("format: got %q want %q", cell, want)
	}
	parsed := parseIngredientsCell(cell)
	if len(parsed) != 2 || parsed[0].IngredientName != "toor dal" || parsed[0].Qty != 80 {
		t.Fatalf("parse: %+v", parsed)
	}
}

func TestParseIngredientsCellVariants(t *testing.T) {
	cases := []struct {
		in   string
		want int
		name string
		qty  float64
	}{
		{"toor dal 80 g, onion 50 g", 2, "toor dal", 80},
		{"paneer, cream", 2, "paneer", 0},
		{"ginger (10 g)", 1, "ginger", 10},
		{"tomato 100g", 1, "tomato", 100},
	}
	for _, tc := range cases {
		got := parseIngredientsCell(tc.in)
		if len(got) != tc.want {
			t.Fatalf("%q: got %d ingredients", tc.in, len(got))
		}
		if got[0].IngredientName != tc.name || got[0].Qty != tc.qty {
			t.Fatalf("%q: first=%+v want name=%q qty=%v", tc.in, got[0], tc.name, tc.qty)
		}
	}
}

func TestParseMenuCSVOneRowPerDish(t *testing.T) {
	raw := strings.Join([]string{
		"Dish Name,Category,Price (INR),Active,Ingredients",
		`Dal Fry,Main Course,180,Yes,"toor dal 80 g, onion 50 g"`,
		"Naan,Breads,45,No,",
	}, "\n")

	dishes, err := parseMenuCSV([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(dishes) != 2 {
		t.Fatalf("expected 2 dishes, got %d", len(dishes))
	}
	if dishes[0].Name != "Dal Fry" || len(dishes[0].Ingredients) != 2 {
		t.Fatalf("dal fry: %+v", dishes[0])
	}
	if dishes[1].Name != "Naan" || dishes[1].IsActive {
		t.Fatalf("naan: %+v", dishes[1])
	}
}

func TestParsePriceINR(t *testing.T) {
	cases := map[string]int{
		"180":   18000,
		"₹250":  25000,
		"99.50": 9950,
		"1,299": 129900,
		"":      0,
	}
	for in, want := range cases {
		got, err := parsePriceINR(in)
		if err != nil {
			t.Fatalf("%q: %v", in, err)
		}
		if got != want {
			t.Fatalf("%q: got %d want %d", in, got, want)
		}
	}
}

func TestFormatPriceINR(t *testing.T) {
	if formatPriceINR(18000) != "180" {
		t.Fatal(formatPriceINR(18000))
	}
	if formatPriceINR(9950) != "99.50" {
		t.Fatal(formatPriceINR(9950))
	}
}
