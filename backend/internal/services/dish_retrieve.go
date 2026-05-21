package services

import (
	"fmt"
	"log"
	"sort"
	"strings"
)

const (
	// CatalogRetrieveTopK is how many dishes word-matching sends to Groq (no LLM in this step).
	CatalogRetrieveTopK = 30
	defaultRetrieveTopK = CatalogRetrieveTopK
)

// DishRetrieveInput carries user context for sparse vector / keyword retrieval.
type DishRetrieveInput struct {
	Category       string
	UserPrompt     string
	MealTypeFilter string // lunch_dinner (default), breakfast, snack, dessert, all
	DietaryTags    []string
	Allergies      []string
	Dislikes       []string
	FavCuisines    []string
	Memories       []string
	RecentDishes      []string
	InventoryNames    []string
	GlobalStarCounts  map[string]int // dish_name (normalized) -> total stars from all users
	TopK              int
}

// RankedDish is a catalog dish with retrieval score.
type RankedDish struct {
	Dish  CatalogDish
	Score float64
}

// RetrieveDishes ranks the dish catalog by word overlap with prefs, memories, prompt,
// inventory, meal_type, diet, and UI category. No Groq call — see CatalogRetrieveTopK.
func RetrieveDishes(in DishRetrieveInput) []RankedDish {
	catalog := DishCatalog()
	if len(catalog) == 0 {
		return nil
	}
	topK := in.TopK
	if topK <= 0 {
		topK = defaultRetrieveTopK
	}

	userVec := buildUserFeatureVector(in)
	signal := userSignalStrength(in, userVec)
	recent := map[string]bool{}
	for _, d := range in.RecentDishes {
		recent[strings.ToLower(strings.TrimSpace(d))] = true
	}
	mealFilter := ResolveEffectiveMealTypeFilter(in.MealTypeFilter, in.UserPrompt)

	var scored []RankedDish
	for _, dish := range catalog {
		if !DishAllowedForUserDiet(dish, in.DietaryTags) {
			continue
		}
		if dishBlockedByDislikes(dish, in.Dislikes) {
			continue
		}
		if dishBlockedByAllergies(dish, in.Allergies) {
			continue
		}
		if in.Category != "" && !DishMatchesUICategory(dish, in.Category) {
			continue
		}
		if !DishMatchesMealTypeFilter(dish, mealFilter) {
			continue
		}
		score := scoreDish(dish, userVec, in) + popularityBoost(dish, in.GlobalStarCounts, signal)
		if recent[strings.ToLower(dish.Name)] {
			score *= 0.35
		}
		if score <= 0 {
			continue
		}
		scored = append(scored, RankedDish{Dish: dish, Score: score})
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})

	if len(scored) > topK {
		scored = scored[:topK]
	}
	if len(scored) == 0 {
		var pool []RankedDish
		for _, dish := range catalog {
			if !DishAllowedForUserDiet(dish, in.DietaryTags) {
				continue
			}
			if in.Category != "" && !DishMatchesUICategory(dish, in.Category) {
				continue
			}
			if !DishMatchesMealTypeFilter(dish, mealFilter) {
				continue
			}
			pool = append(pool, RankedDish{Dish: dish, Score: dish.RetrievalStarScore(in.GlobalStarCounts)})
		}
		sort.Slice(pool, func(i, j int) bool {
			return pool[i].Score > pool[j].Score
		})
		if len(pool) > topK {
			pool = pool[:topK]
		}
		scored = pool
	}

	log.Printf("[dish_retrieve] word-match top %d/%d dishes (category=%q, mealFilter=%q, userTokens=%d, signal=%d)",
		len(scored), len(catalog), in.Category, mealFilter, len(userVec), signal)

	return scored
}

// applyFavCuisineBoost maps profile cuisines and prompts to catalog cuisine slugs.
func applyFavCuisineBoost(vec map[string]float64, raw string) {
	lower := strings.ToLower(strings.TrimSpace(raw))
	if lower == "" {
		return
	}
	boost := func(slug string, w float64) {
		slug = strings.TrimSpace(slug)
		if slug == "" {
			return
		}
		vec[slug] += w
		for _, t := range tokenizeForDishes(slug) {
			vec[t] += w * 0.85
		}
	}
	switch {
	case strings.Contains(lower, "north indian"), strings.Contains(lower, "punjabi"):
		boost("north-indian", 3)
		boost("indian", 1.5)
	case strings.Contains(lower, "south indian"), strings.Contains(lower, "karnataka"),
		strings.Contains(lower, "tamil"), strings.Contains(lower, "telugu"), strings.Contains(lower, "kerala"):
		boost("south-indian", 3)
		boost("indian", 1.5)
	case strings.Contains(lower, "bengali"), strings.Contains(lower, "east indian"):
		boost("east-indian", 3)
		boost("indian", 1.5)
	case strings.Contains(lower, "gujarati"), strings.Contains(lower, "maharashtrian"), strings.Contains(lower, "west indian"):
		boost("west-indian", 3)
		boost("indian", 1.5)
	case strings.Contains(lower, "indian"):
		boost("indian", 2.5)
	case strings.Contains(lower, "italian"):
		boost("italian", 3)
	case strings.Contains(lower, "chinese"):
		boost("chinese", 3)
	case strings.Contains(lower, "thai"):
		boost("thai", 3)
	case strings.Contains(lower, "mexican"):
		boost("american", 2)
	case strings.Contains(lower, "american"):
		boost("american", 3)
	case strings.Contains(lower, "british"):
		boost("british", 3)
	case strings.Contains(lower, "french"):
		boost("french", 3)
	case strings.Contains(lower, "spanish"):
		boost("spanish", 3)
	case strings.Contains(lower, "turkish"):
		boost("turkish", 3)
	case strings.Contains(lower, "vietnamese"):
		boost("vietnamese", 3)
	case strings.Contains(lower, "continental"):
		boost("french", 1.5)
		boost("italian", 1.5)
	}
}

func buildUserFeatureVector(in DishRetrieveInput) map[string]float64 {
	vec := map[string]float64{}
	addText := func(s string, w float64) {
		for _, t := range tokenizeForDishes(s) {
			vec[t] += w
		}
	}
	addText(in.UserPrompt, 2.5)
	addText(in.Category, 2.0)
	for _, t := range in.DietaryTags {
		addText(t, 1.5)
	}
	for _, c := range in.FavCuisines {
		addText(c, 2.0)
		applyFavCuisineBoost(vec, c)
	}
	applyFavCuisineBoost(vec, in.UserPrompt)
	for _, m := range in.Memories {
		addText(m, 1.8)
	}
	for _, n := range in.InventoryNames {
		addText(n, 1.2)
	}
	for _, d := range in.Dislikes {
		addText(d, -3.0)
	}
	return vec
}

// userSignalStrength estimates how much preference/prompt/inventory context we have (higher = richer input).
func userSignalStrength(in DishRetrieveInput, userVec map[string]float64) int {
	n := len(userVec)
	if strings.TrimSpace(in.UserPrompt) != "" {
		n += 3
	}
	if len(in.FavCuisines) > 0 {
		n += 2
	}
	if len(in.Memories) > 0 {
		n += len(in.Memories)
	}
	if len(in.InventoryNames) > 0 {
		n += min(len(in.InventoryNames), 8)
	}
	if in.Category != "" && in.Category != "daily" {
		n += 1
	}
	return n
}

// popularityBoost uses global star counts when the user gave little context.
func popularityBoost(dish CatalogDish, globalStars map[string]int, signal int) float64 {
	base := dish.RetrievalStarScore(globalStars) * 0.35
	switch {
	case signal < 4:
		return base * 2.8
	case signal < 10:
		return base * 1.4
	default:
		return base * 0.5
	}
}

func scoreDish(dish CatalogDish, userVec map[string]float64, in DishRetrieveInput) float64 {
	dishTokens := dish.featureTokens()
	var dot float64
	for t := range dishTokens {
		if w, ok := userVec[t]; ok {
			dot += w
		}
	}
	if slug := strings.ToLower(strings.TrimSpace(dish.Cuisine)); slug != "" {
		if w, ok := userVec[slug]; ok {
			dot += w
		}
	}
	if diet := dish.NormalizedDiet(); diet != "" {
		if w, ok := userVec[diet]; ok {
			dot += w * 1.2
		}
	}
	for _, slot := range dish.MealType {
		if w, ok := userVec[strings.ToLower(slot)]; ok {
			dot += w * 1.1
		}
	}
	if in.Category != "" && DishMatchesUICategory(dish, in.Category) {
		dot += 3.0
	}
	dot += uiCategoryStyleBoost(dish, in.Category)
	if in.Category == "rescue_meal" || in.Category == "meal_of_day" {
		for _, inv := range in.InventoryNames {
			for _, t := range tokenizeForDishes(inv) {
				if _, ok := dishTokens[t]; ok {
					dot += 1.5
				}
			}
		}
	}
	if len(in.FavCuisines) == 0 && strings.TrimSpace(in.UserPrompt) == "" && isIndianCuisine(dish.Cuisine) {
		dot += 0.8
	}
	if dot < 0 {
		return 0
	}
	return dot
}

// uiCategoryStyleBoost nudges dishes for tasty / healthy / meal-prep style categories (name heuristics).
func uiCategoryStyleBoost(dish CatalogDish, uiCategory string) float64 {
	name := strings.ToLower(dish.Name)
	switch strings.ToLower(strings.TrimSpace(uiCategory)) {
	case "most_tasty":
		if strings.Contains(name, "butter") || strings.Contains(name, "tikka") ||
			strings.Contains(name, "masala") || strings.Contains(name, "fried") {
			return 2.0
		}
	case "most_healthy":
		if strings.Contains(name, "dal") || strings.Contains(name, "sabzi") ||
			strings.Contains(name, "rasam") || strings.Contains(name, "steamed") {
			return 2.0
		}
		if dish.NormalizedDiet() == "vegan" || dish.NormalizedDiet() == "vegetarian" {
			return 0.8
		}
	case "long_lasting":
		if strings.Contains(name, "biryani") || strings.Contains(name, "khichdi") ||
			strings.Contains(name, "rajma") || strings.Contains(name, "chole") {
			return 2.0
		}
	case "rescue_meal":
		if strings.Contains(name, "quick") || strings.Contains(name, "stir") {
			return 1.2
		}
	}
	return 0
}

func isIndianCuisine(cuisine string) bool {
	c := strings.ToLower(strings.TrimSpace(cuisine))
	return c == "indian" || strings.HasSuffix(c, "-indian")
}

func dishBlockedByDislikes(d CatalogDish, dislikes []string) bool {
	name := strings.ToLower(d.Name)
	for _, dis := range dislikes {
		dis = strings.ToLower(strings.TrimSpace(dis))
		if dis == "" {
			continue
		}
		if strings.Contains(name, dis) {
			return true
		}
		for _, t := range tokenizeForDishes(dis) {
			if _, ok := d.featureTokens()[t]; ok {
				return true
			}
		}
	}
	return false
}

func dishBlockedByAllergies(d CatalogDish, allergies []string) bool {
	tokens := d.featureTokens()
	for _, a := range allergies {
		for _, t := range tokenizeForDishes(a) {
			if _, ok := tokens[t]; ok {
				return true
			}
		}
	}
	return false
}

func FormatCandidateList(ranked []RankedDish, globalStars map[string]int) string {
	if len(ranked) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("Shortlist (word-matched; Groq must pick only from these names):\n")
	for i, r := range ranked {
		b.WriteString(fmt.Sprintf("%d. %s", i+1, r.Dish.Name))
		var meta []string
		if c := strings.TrimSpace(r.Dish.Cuisine); c != "" {
			meta = append(meta, c)
		}
		if d := r.Dish.NormalizedDiet(); d != "" {
			meta = append(meta, d)
		}
		if len(r.Dish.MealType) > 0 {
			meta = append(meta, strings.Join(r.Dish.MealType, ", "))
		}
		if len(r.Dish.Ingredients) > 0 {
			meta = append(meta, "ing: "+strings.Join(r.Dish.Ingredients, ", "))
		}
		if n := r.Dish.GlobalStarCount(globalStars); n > 0 {
			meta = append(meta, fmt.Sprintf("%d stars", n))
		}
		if len(meta) > 0 {
			b.WriteString(" [" + strings.Join(meta, " | ") + "]")
		}
		b.WriteString("\n")
	}
	return b.String()
}
