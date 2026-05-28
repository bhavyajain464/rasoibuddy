package services

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

type eatenCatalogRow struct {
	EatenName      string
	EatCount       int
	Matched        bool
	CatalogID      string
	CatalogLabel   string
	Cuisine        string
	Diet           string
	KeyIngredients []string
	PairsWith      []string
}

type catalogDishBrief struct {
	Name           string
	Cuisine        string
	KeyIngredients []string
	Score          float64
	Source         string // "related" | "history"
}

type scoredStaple struct {
	Name    string
	Score   int
	Sources []string
}

type orderSuggestContext struct {
	EatenRows      []eatenCatalogRow
	UnmatchedEaten []frequentDish
	MissingStaples []scoredStaple
	RelatedDishes  []catalogDishBrief
}

func (c orderSuggestContext) hasSignal() bool {
	return len(c.EatenRows) > 0 || len(c.UnmatchedEaten) > 0 || len(c.RelatedDishes) > 0 || len(c.MissingStaples) > 0
}

func buildOrderSuggestContext(in OrderSuggestInput) orderSuggestContext {
	frequent := countFrequentEatenDishes(in.EatenLog, 12)
	pantry := append([]string{}, in.Inventory...)
	pantry = append(pantry, in.ShoppingList...)

	eatenKeys := map[string]bool{}
	var eatenRows []eatenCatalogRow
	var unmatched []frequentDish

	ingScores := map[string]*scoredStaple{}

	addIngredient := func(raw, source string, weight int) {
		raw = strings.TrimSpace(raw)
		if raw == "" || weight <= 0 {
			return
		}
		// pairs_with entries can be dish names — skip long slash phrases as grocery
		if strings.Contains(raw, "/") && !strings.Contains(raw, " ") {
			return
		}
		names := expandCompoundGrocery(raw)
		for _, part := range names {
			part = strings.TrimSpace(part)
			if part == "" || isBlockedShoppingName(part) {
				continue
			}
			key := NormalizeDishName(part)
			if key == "" {
				continue
			}
			display := titleIngredientToken(part)
			if s, ok := ingScores[key]; ok {
				s.Score += weight
				if len(s.Sources) < 4 && !containsString(s.Sources, source) {
					s.Sources = append(s.Sources, source)
				}
			} else {
				ingScores[key] = &scoredStaple{Name: display, Score: weight, Sources: []string{source}}
			}
		}
	}

	for _, fd := range frequent {
		if dish, ok := FindCatalogDishByName(fd.Name); ok {
			key := NormalizeDishName(dish.Name)
			eatenKeys[key] = true
			row := eatenCatalogRow{
				EatenName:      fd.Name,
				EatCount:       fd.Count,
				Matched:        true,
				CatalogID:      dish.ID,
				CatalogLabel:   dish.DisplayLabel(),
				Cuisine:        dish.Cuisine,
				Diet:           dish.NormalizedDiet(),
				KeyIngredients: dish.CatalogIngredients(),
				PairsWith:      dish.PairsWith,
			}
			eatenRows = append(eatenRows, row)
			for _, ing := range dish.CatalogIngredients() {
				addIngredient(ing, dish.DisplayLabel(), fd.Count*3)
			}
			for _, p := range dish.PairsWith {
				addIngredient(p, dish.DisplayLabel()+" (side)", fd.Count)
			}
		} else {
			unmatched = append(unmatched, fd)
		}
	}

	cookedDays := buildCookedDaysAgoMap(in.EatenLog)
	retrieveIn := DishRetrieveInput{
		Category:         "daily",
		DietaryTags:      in.DietaryTags,
		Allergies:        in.Allergies,
		Dislikes:         in.Dislikes,
		FavCuisines:      in.FavCuisines,
		Memories:         in.Memories,
		CookedDaysAgo:    cookedDays,
		InventoryNames:   in.Inventory,
		GlobalStarCounts: nil,
		TopK:             12,
		Now:              time.Now(),
	}
	ranked := RetrieveDishes(retrieveIn)

	var related []catalogDishBrief
	for i, rd := range ranked {
		if i >= 10 {
			break
		}
		key := NormalizeDishName(rd.Dish.Name)
		source := "related"
		weight := 2
		if eatenKeys[key] {
			source = "history"
			weight = 1 // already weighted heavily above
		}
		related = append(related, catalogDishBrief{
			Name:           rd.Dish.DisplayLabel(),
			Cuisine:        rd.Dish.Cuisine,
			KeyIngredients: rd.Dish.CatalogIngredients(),
			Score:          rd.Score,
			Source:         source,
		})
		if !eatenKeys[key] {
			for _, ing := range rd.Dish.CatalogIngredients() {
				addIngredient(ing, rd.Dish.DisplayLabel(), weight)
			}
		}
	}

	var missing []scoredStaple
	for _, s := range ingScores {
		if itemCoveredByPantry(s.Name, pantry) {
			continue
		}
		missing = append(missing, *s)
	}
	sort.Slice(missing, func(i, j int) bool {
		if missing[i].Score != missing[j].Score {
			return missing[i].Score > missing[j].Score
		}
		return missing[i].Name < missing[j].Name
	})
	if len(missing) > 16 {
		missing = missing[:16]
	}

	return orderSuggestContext{
		EatenRows:      eatenRows,
		UnmatchedEaten: unmatched,
		MissingStaples: missing,
		RelatedDishes:  related,
	}
}

func buildCookedDaysAgoMap(entries []CookedLogEntry) map[string]int {
	now := time.Now().UTC()
	out := map[string]int{}
	for _, e := range entries {
		cookedOn, err := time.Parse("2006-01-02", e.CookedOn)
		if err != nil {
			continue
		}
		days := int(now.Sub(cookedOn).Hours() / 24)
		if days < 0 {
			days = 0
		}
		key := NormalizeDishName(e.DishName)
		if key == "" {
			continue
		}
		if prev, ok := out[key]; !ok || days < prev {
			out[key] = days
		}
	}
	return out
}

func containsString(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func buildOrderSuggestPrompt(ctx orderSuggestContext, in OrderSuggestInput) string {
	var b strings.Builder
	b.WriteString("Suggest groceries to order using BOTH (1) what this household actually cooked recently and (2) dish catalog.json profiles.\n\n")

	if len(in.DietaryTags) > 0 {
		b.WriteString("Dietary: ")
		b.WriteString(strings.Join(in.DietaryTags, ", "))
		b.WriteString("\n")
	}
	if len(in.Allergies) > 0 {
		b.WriteString("Allergies (never suggest): ")
		b.WriteString(strings.Join(in.Allergies, ", "))
		b.WriteString("\n")
	}
	if len(in.Dislikes) > 0 {
		b.WriteString("Dislikes: ")
		b.WriteString(strings.Join(in.Dislikes, ", "))
		b.WriteString("\n")
	}
	if len(in.FavCuisines) > 0 {
		b.WriteString("Favourite cuisines: ")
		b.WriteString(strings.Join(in.FavCuisines, ", "))
		b.WriteString("\n")
	}
	b.WriteString("\n")

	b.WriteString("=== (1) Meal history — dishes actually cooked (last 15 days) ===\n")
	if len(ctx.EatenRows) == 0 && len(ctx.UnmatchedEaten) == 0 {
		b.WriteString("(no logged meals)\n")
	}
	for _, row := range ctx.EatenRows {
		b.WriteString(fmt.Sprintf("- %s ×%d → catalog: %s (%s, %s)\n",
			row.EatenName, row.EatCount, row.CatalogLabel, row.Cuisine, row.Diet))
		if len(row.KeyIngredients) > 0 {
			b.WriteString("  key_ingredients: ")
			b.WriteString(strings.Join(row.KeyIngredients, ", "))
			b.WriteString("\n")
		}
		if len(row.PairsWith) > 0 {
			n := len(row.PairsWith)
			if n > 4 {
				n = 4
			}
			b.WriteString("  pairs_with: ")
			b.WriteString(strings.Join(row.PairsWith[:n], ", "))
			b.WriteString("\n")
		}
	}
	for _, fd := range ctx.UnmatchedEaten {
		b.WriteString(fmt.Sprintf("- %s ×%d (not matched to catalog.json — infer staples cautiously)\n", fd.Name, fd.Count))
	}
	b.WriteString("\n")

	b.WriteString("=== (2) Catalog.json — related dishes & aggregated staples ===\n")
	if len(ctx.RelatedDishes) > 0 {
		b.WriteString("Related catalog dishes (ranked for this household):\n")
		for i, d := range ctx.RelatedDishes {
			if i >= 8 {
				break
			}
			ings := d.KeyIngredients
			if len(ings) > 6 {
				ings = ings[:6]
			}
			b.WriteString(fmt.Sprintf("- %s [%s] score=%.1f", d.Name, d.Source, d.Score))
			if d.Cuisine != "" {
				b.WriteString(" " + d.Cuisine)
			}
			if len(ings) > 0 {
				b.WriteString(" — " + strings.Join(ings, ", "))
			}
			b.WriteString("\n")
		}
	}
	if len(ctx.MissingStaples) > 0 {
		b.WriteString("\nCatalog-derived staples likely MISSING from pantry (prioritize these if sensible):\n")
		for i, s := range ctx.MissingStaples {
			if i >= 14 {
				break
			}
			src := strings.Join(s.Sources, ", ")
			if len(src) > 60 {
				src = src[:57] + "…"
			}
			b.WriteString(fmt.Sprintf("- %s (weight %d", s.Name, s.Score))
			if src != "" {
				b.WriteString(", from: " + src)
			}
			b.WriteString(")\n")
		}
	}
	b.WriteString("\n")

	if len(in.Inventory) > 0 {
		b.WriteString("Already in pantry (do NOT suggest):\n")
		n := len(in.Inventory)
		if n > 35 {
			n = 35
		}
		b.WriteString(strings.Join(in.Inventory[:n], ", "))
		b.WriteString("\n\n")
	} else {
		b.WriteString("Pantry: empty or not tracked.\n\n")
	}

	if len(in.ShoppingList) > 0 {
		b.WriteString("Already on shopping list (do NOT suggest):\n")
		b.WriteString(strings.Join(in.ShoppingList, ", "))
		b.WriteString("\n\n")
	}

	if len(in.ExcludeItems) > 0 {
		b.WriteString("Already suggested this session (pick DIFFERENT items):\n")
		b.WriteString(strings.Join(in.ExcludeItems, ", "))
		b.WriteString("\n\n")
	}

	b.WriteString(fmt.Sprintf("Request time: %s\n", time.Now().UTC().Format(time.RFC3339)))
	b.WriteString("Shopping list rule: never output bundled items (mixed vegetables, whole spices). Output individual vegetables and spices only.\n")
	b.WriteString("Combine meal history AND catalog analysis. Return JSON only.")
	return b.String()
}
