package services

import (
	"strings"
	"testing"
)

func TestBuildOrderSuggestContext_MergesHistoryAndCatalog(t *testing.T) {
	in := OrderSuggestInput{
		EatenLog: []CookedLogEntry{
			{DishName: "Dal Tadka", CookedOn: "2026-05-27"},
			{DishName: "Dal Tadka", CookedOn: "2026-05-26"},
		},
		Inventory:   []string{"rice", "atta"},
		DietaryTags: []string{"vegetarian"},
	}
	ctx := buildOrderSuggestContext(in)
	if len(ctx.EatenRows) == 0 {
		t.Fatal("expected catalog match for Dal Tadka")
	}
	if ctx.EatenRows[0].CatalogLabel == "" {
		t.Fatal("expected catalog label on eaten row")
	}
	if len(ctx.RelatedDishes) == 0 {
		t.Fatal("expected related catalog dishes from RetrieveDishes")
	}
	if len(ctx.MissingStaples) == 0 {
		t.Log("no missing staples (pantry may cover dal tadka ingredients)")
	}
	for _, s := range ctx.MissingStaples {
		low := strings.ToLower(s.Name)
		if strings.Contains(low, "roti") || strings.Contains(low, "chapati") {
			t.Errorf("should not list bread item %q when atta in pantry", s.Name)
		}
	}
}
