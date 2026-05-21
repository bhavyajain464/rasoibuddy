package services

// DietDayReport is structured nutrition output from Groq for one calendar day.
type DietDayReport struct {
	Date            string              `json:"date"`
	Summary         string              `json:"summary"`
	BalanceScore    int                 `json:"balance_score"`
	Totals          DietMacroTotals     `json:"totals"`
	MacroSplitPct   DietMacroSplit      `json:"macro_split_pct"`
	Meals           []DietMealBreakdown `json:"meals"`
	Micronutrients  []DietMicronutrient `json:"micronutrients"`
	Highlights      []string            `json:"highlights"`
	Suggestions     []string            `json:"suggestions"`
	Disclaimer      string              `json:"disclaimer"`
}

type DietMacroTotals struct {
	CaloriesKcal float64 `json:"calories_kcal"`
	ProteinG     float64 `json:"protein_g"`
	CarbsG       float64 `json:"carbs_g"`
	FatG         float64 `json:"fat_g"`
	FiberG       float64 `json:"fiber_g"`
	SugarG       float64 `json:"sugar_g"`
	SodiumMg     float64 `json:"sodium_mg"`
}

type DietMacroSplit struct {
	Protein float64 `json:"protein"`
	Carbs   float64 `json:"carbs"`
	Fat     float64 `json:"fat"`
}

type DietMealBreakdown struct {
	Name         string  `json:"name"`
	Slot         string  `json:"slot"`
	CaloriesKcal float64 `json:"calories_kcal"`
	ProteinG     float64 `json:"protein_g"`
	CarbsG       float64 `json:"carbs_g"`
	FatG         float64 `json:"fat_g"`
}

type DietMicronutrient struct {
	Name   string `json:"name"`
	Amount string `json:"amount"`
	Status string `json:"status"`
	Note   string `json:"note"`
}
