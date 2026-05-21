package services

import "testing"

func TestParseDietDayReportJSON(t *testing.T) {
	raw := `{"summary":"Good day","balance_score":75,"totals":{"calories_kcal":2000,"protein_g":80,"carbs_g":250,"fat_g":65,"fiber_g":20,"sugar_g":30,"sodium_mg":1800},"macro_split_pct":{"protein":25,"carbs":50,"fat":25},"meals":[],"micronutrients":[],"highlights":[],"suggestions":[]}`
	r, err := parseDietDayReportJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if r.Totals.CaloriesKcal != 2000 || r.BalanceScore != 75 {
		t.Fatalf("unexpected parse: %+v", r)
	}
}

func TestBuildDietReportPDF(t *testing.T) {
	report := &DietDayReport{
		Date:         "2026-05-16",
		Summary:      "Balanced vegetarian day.",
		BalanceScore: 78,
		Totals: DietMacroTotals{
			CaloriesKcal: 2100, ProteinG: 72, CarbsG: 280, FatG: 68, FiberG: 22, SugarG: 35, SodiumMg: 1900,
		},
		MacroSplitPct: DietMacroSplit{Protein: 24, Carbs: 52, Fat: 24},
		Meals: []DietMealBreakdown{
			{Name: "dal with rice", Slot: "lunch", CaloriesKcal: 650, ProteinG: 22, CarbsG: 95, FatG: 18},
			{Name: "paneer parathe", Slot: "dinner", CaloriesKcal: 850, ProteinG: 35, CarbsG: 110, FatG: 38},
		},
		Micronutrients: []DietMicronutrient{{Name: "Iron", Amount: "14mg", Status: "adequate", Note: "ok"}},
		Highlights:     []string{"Good protein at dinner"},
		Suggestions:    []string{"Add a fruit snack"},
		Disclaimer:     "Estimates only.",
	}
	pdf, err := BuildDietReportPDF(report)
	if err != nil {
		t.Fatal(err)
	}
	if len(pdf) < 500 {
		t.Fatalf("PDF too small: %d bytes", len(pdf))
	}
	if pdf[0] != '%' || pdf[1] != 'P' {
		t.Fatal("not a PDF header")
	}
}
