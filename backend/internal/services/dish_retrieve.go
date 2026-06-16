package services

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"sort"
	"strings"
	"time"
)

const (
	// CatalogRetrieveTopK is how many dishes word-matching sends to Groq (no LLM in this step).
	CatalogRetrieveTopK = 30
	defaultRetrieveTopK = CatalogRetrieveTopK
)

// DishRetrieveInput carries user context for sparse vector / keyword retrieval.
type DishRetrieveInput struct {
	Category         string
	UserPrompt       string
	MealTypeFilter   string // lunch_dinner (default), breakfast, snack, dessert, all
	DietaryTags      []string
	Allergies        []string
	Dislikes         []string
	FavCuisines      []string
	SpiceLevel       string // mild | medium | spicy (profile preference; "" = no preference)
	Memories         []string
	CookedDaysAgo    map[string]int // catalog key -> days since last eaten
	SuggestedDaysAgo map[string]int // catalog key -> days since last AI suggestion
	InventoryNames   []string
	// ExpiringNames is a subset of inventory expiring soon (rescue meals weight these heavily).
	ExpiringNames    []string
	GlobalStarCounts map[string]int // dish_name (normalized) -> total stars from all users
	TopK             int
	Now              time.Time // zero = time.Now()

	// Temperature controls suggestion variance. 0 (default) = deterministic argmax
	// (highest-scored first, stable ordering). >0 enables weighted softmax sampling
	// over the shortlist so repeated calls vary while still favouring high scores.
	// Typical: 0.6 = mostly-best with healthy rotation, 1.0 = adventurous.
	Temperature float64
	// RandSeed seeds the sampler. Seed with hash(userID|date|mealSlot) so a pick is
	// stable within a slot/day but differs across days. 0 falls back to a fixed seed.
	RandSeed int64
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

	now := in.Now
	if now.IsZero() {
		now = time.Now()
	}
	userVec := buildUserFeatureVector(in)
	signal := userSignalStrength(in, userVec)
	mealFilter := ResolveEffectiveMealTypeFilter(in.MealTypeFilter, in.UserPrompt)
	suggestCtx := DeriveSuggestionContext(now, in.Category)

	scored := rankDishesForRetrieve(catalog, in, userVec, signal, mealFilter, suggestCtx, topK)
	if len(scored) == 0 && suggestCtx.WeekdayMode {
		relaxed := RelaxedSuggestionContext(suggestCtx)
		scored = rankDishesForRetrieve(catalog, in, userVec, signal, mealFilter, relaxed, topK)
	}
	if len(scored) == 0 {
		scored = rankDishesForRetrieve(catalog, in, userVec, signal, mealFilter, SuggestionContext{}, topK)
	}

	log.Printf("[dish_retrieve] word-match top %d/%d dishes (category=%q, mealFilter=%q, weekdayMode=%v, maxCook=%d, userTokens=%d, signal=%d)",
		len(scored), len(catalog), in.Category, mealFilter, suggestCtx.WeekdayMode, suggestCtx.MaxCookMins, len(userVec), signal)

	if in.Temperature > 0 {
		scored = SampleRankedDishes(scored, in.Temperature, in.RandSeed)
	}
	return scored
}

// SampleRankedDishes reorders an already score-ranked, recency-decayed shortlist using
// temperature-weighted sampling without replacement. Higher-scored dishes are more likely
// to land on top, but the order varies with the seed — giving "best, but not the same
// every time". Hard filters (diet/allergy/jain) and the recency multiplier are already
// applied upstream, so this only adds controlled variance. Deterministic for a given seed.
func SampleRankedDishes(ranked []RankedDish, temperature float64, seed int64) []RankedDish {
	if len(ranked) <= 1 || temperature <= 0 {
		return ranked
	}
	if seed == 0 {
		seed = 1
	}
	rng := rand.New(rand.NewSource(seed))

	pool := make([]RankedDish, len(ranked))
	copy(pool, ranked)
	out := make([]RankedDish, 0, len(pool))

	for len(pool) > 0 {
		// weight_i = score_i ^ (1/T); exponent>1 sharpens toward the best as T->0.
		inv := 1.0 / temperature
		var total float64
		weights := make([]float64, len(pool))
		for i, r := range pool {
			s := r.Score
			if s <= 0 {
				s = 1e-9
			}
			w := math.Pow(s, inv)
			weights[i] = w
			total += w
		}
		if total <= 0 {
			out = append(out, pool...)
			break
		}
		target := rng.Float64() * total
		pick := len(pool) - 1
		var acc float64
		for i, w := range weights {
			acc += w
			if acc >= target {
				pick = i
				break
			}
		}
		out = append(out, pool[pick])
		pool = append(pool[:pick], pool[pick+1:]...)
	}
	return out
}

func rankDishesForRetrieve(
	catalog []CatalogDish,
	in DishRetrieveInput,
	userVec map[string]float64,
	signal int,
	mealFilter string,
	suggestCtx SuggestionContext,
	topK int,
) []RankedDish {
	useContext := suggestCtx.MaxCookMins > 0 || suggestCtx.WeekdayMode
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
		if dishBlockedByAllergenFlags(dish, in.Allergies) {
			continue
		}
		if dishBlockedForJain(dish, in.DietaryTags) {
			continue
		}
		if in.Category != "" && !DishMatchesUICategory(dish, in.Category) {
			continue
		}
		if !DishMatchesMealTypeFilter(dish, mealFilter) {
			continue
		}
		if useContext && !DishMatchesSuggestionContext(dish, suggestCtx) {
			continue
		}
		score := scoreDish(dish, userVec, in) + popularityBoost(dish, in.GlobalStarCounts, signal)
		if useContext {
			score += CatalogContextBoost(dish, suggestCtx, in.Category)
		}
		days := DaysSinceLastExposure(dish, in.CookedDaysAgo, in.SuggestedDaysAgo)
		score *= CatalogRecencyWeight(dish, days)
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
	if in.Category == "rescue_meal" {
		expiring := map[string]bool{}
		for _, n := range in.ExpiringNames {
			expiring[normIngredient(n)] = true
		}
		for _, n := range in.InventoryNames {
			w := 1.2
			if expiring[normIngredient(n)] {
				w = 3.5
			}
			addText(n, w)
		}
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
	if in.Category == "rescue_meal" && len(in.InventoryNames) > 0 {
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
	if in.Category == "rescue_meal" && len(in.InventoryNames) > 0 {
		match := MatchDishToInventory(dish, BuildHaveIngredientSet(nil, in.InventoryNames))
		dot += match.Coverage * 3.0
		dot += float64(len(match.Have)) * 0.35
	}
	if in.Category == "rescue_meal" && len(in.ExpiringNames) > 0 {
		expUsed := InventoryItemsUsedByDish(dish, in.ExpiringNames)
		dot += float64(len(expUsed)) * 3.5
		if len(expUsed) > 0 {
			dot += float64(len(expUsed)) / float64(len(in.ExpiringNames)) * 5.0
		}
	}
	if len(in.FavCuisines) == 0 && strings.TrimSpace(in.UserPrompt) == "" && isIndianCuisine(dish.Cuisine) {
		dot += 0.8
	}
	dot += spiceMatchBoost(dish, in.SpiceLevel)
	if dot < 0 {
		return 0
	}
	return dot
}

// spiceMatchBoost rewards dishes matching the user's spice preference and gently
// penalises a mismatch (e.g. a "spicy" dish for a "mild" preference). No preference
// or missing dish metadata => neutral.
func spiceMatchBoost(dish CatalogDish, pref string) float64 {
	pref = strings.ToLower(strings.TrimSpace(pref))
	level := strings.ToLower(strings.TrimSpace(dish.SpiceLevel))
	if pref == "" || level == "" {
		return 0
	}
	if pref == level {
		return 1.2
	}
	// adjacent (mild<->medium, medium<->spicy) is tolerable; opposite ends are penalised.
	rank := map[string]int{"mild": 0, "medium": 1, "spicy": 2}
	pr, ok1 := rank[pref]
	lr, ok2 := rank[level]
	if !ok1 || !ok2 {
		return 0
	}
	switch d := pr - lr; {
	case d == 1 || d == -1:
		return 0
	default: // distance 2 (mild vs spicy)
		return -1.0
	}
}

// uiCategoryStyleBoost nudges dishes for tasty / healthy / meal-prep style categories.
func uiCategoryStyleBoost(dish CatalogDish, uiCategory string) float64 {
	name := strings.ToLower(dish.DisplayLabel())
	effort := strings.ToLower(strings.TrimSpace(dish.Effort))
	switch strings.ToLower(strings.TrimSpace(uiCategory)) {
	case "most_tasty":
		// Rank primarily by the per-dish tasty_score (0-100 -> 0-4 boost).
		if dish.TastyScore > 0 {
			return float64(dish.TastyScore) / 25.0
		}
		// Fallback heuristic if a dish has no score yet.
		if effort == "medium" || effort == "high" {
			return 1.5
		}
		if strings.Contains(name, "butter") || strings.Contains(name, "tikka") ||
			strings.Contains(name, "masala") {
			return 1.2
		}
	case "most_healthy":
		// Rank primarily by the per-dish healthy_score (0-100 -> 0-4 boost).
		if dish.HealthyScore > 0 {
			return float64(dish.HealthyScore) / 25.0
		}
		// Fallback heuristic if a dish has no score yet.
		if strings.Contains(name, "dal") || strings.Contains(name, "sabzi") ||
			strings.Contains(name, "rasam") || strings.Contains(name, "khichdi") {
			return 2.0
		}
		if dish.NormalizedDiet() == "vegan" || dish.NormalizedDiet() == "vegetarian" {
			return 0.8
		}
	case "long_lasting":
		if dish.OnePot || strings.Contains(name, "biryani") || strings.Contains(name, "khichdi") ||
			strings.Contains(name, "rajma") || strings.Contains(name, "chole") {
			return 2.0
		}
	case "rescue_meal":
		if dish.Effort == "low" || dish.CookTimeMinutes > 0 && dish.CookTimeMinutes <= 30 {
			return 1.5
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

// allergyTermToFlag maps free-text profile allergy words to the catalog's normalized
// allergen flags. This bridges the term<->ingredient gap that the literal token matcher
// in dishBlockedByAllergies cannot (e.g. "nuts" never matches "cashew", "dairy" never
// matches "ghee"/"paneer", "gluten" never matches "wheat"/"maida").
var allergyTermToFlag = map[string]string{
	"dairy": "dairy", "milk": "dairy", "lactose": "dairy", "ghee": "dairy",
	"paneer": "dairy", "butter": "dairy", "cheese": "dairy", "curd": "dairy", "cream": "dairy",
	"gluten": "gluten", "wheat": "gluten", "maida": "gluten", "atta": "gluten",
	"nut": "nuts", "nuts": "nuts", "treenut": "nuts", "tree nut": "nuts",
	"cashew": "nuts", "almond": "nuts", "pista": "nuts", "pistachio": "nuts", "walnut": "nuts",
	"peanut": "peanut", "peanuts": "peanut", "groundnut": "peanut",
	"sesame": "sesame", "til": "sesame",
	"soy": "soy", "soya": "soy", "soybean": "soy", "tofu": "soy",
	"egg": "egg", "eggs": "egg",
}

// dishBlockedByAllergenFlags excludes a dish when any profile allergy maps to one of the
// dish's structured allergen flags. Complements dishBlockedByAllergies for safety.
func dishBlockedByAllergenFlags(d CatalogDish, allergies []string) bool {
	if len(d.Allergens) == 0 || len(allergies) == 0 {
		return false
	}
	has := map[string]bool{}
	for _, f := range d.Allergens {
		has[strings.ToLower(strings.TrimSpace(f))] = true
	}
	for _, a := range allergies {
		key := strings.ToLower(strings.TrimSpace(a))
		if flag, ok := allergyTermToFlag[key]; ok && has[flag] {
			return true
		}
	}
	return false
}

// dishBlockedForJain excludes onion/garlic/root-veg dishes when the profile requests Jain.
func dishBlockedForJain(d CatalogDish, dietaryTags []string) bool {
	wantsJain := false
	for _, tag := range dietaryTags {
		if strings.Contains(strings.ToLower(strings.TrimSpace(tag)), "jain") {
			wantsJain = true
			break
		}
	}
	if !wantsJain {
		return false
	}
	return !d.JainSafe
}

func FormatCandidateList(ranked []RankedDish, globalStars map[string]int, category string, inventoryNames, expiringNames []string) string {
	if len(ranked) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("Shortlist (word-matched; Groq must pick only from these names):\n")
	for i, r := range ranked {
		b.WriteString(fmt.Sprintf("%d. %s", i+1, r.Dish.Name))
		var meta []string
		if label := r.Dish.DisplayLabel(); label != r.Dish.Name {
			meta = append(meta, "display: "+label)
		}
		if c := strings.TrimSpace(r.Dish.Cuisine); c != "" {
			meta = append(meta, c)
		}
		if d := r.Dish.NormalizedDiet(); d != "" {
			meta = append(meta, d)
		}
		if e := strings.TrimSpace(r.Dish.Effort); e != "" {
			meta = append(meta, e+" effort")
		}
		if r.Dish.CookTimeMinutes > 0 {
			meta = append(meta, fmt.Sprintf("%d min", r.Dish.CookTimeMinutes))
		}
		if r.Dish.WeekdayFriendly {
			meta = append(meta, "weekday")
		}
		if len(r.Dish.MealType) > 0 {
			meta = append(meta, strings.Join(r.Dish.MealType, ", "))
		}
		if ing := r.Dish.CatalogIngredients(); len(ing) > 0 {
			meta = append(meta, "ing: "+strings.Join(ing, ", "))
		}
		if len(r.Dish.PairsWith) > 0 {
			meta = append(meta, "pairs: "+strings.Join(r.Dish.PairsWith, ", "))
		}
		switch strings.ToLower(strings.TrimSpace(category)) {
		case "most_healthy":
			if r.Dish.HealthyScore > 0 {
				meta = append(meta, fmt.Sprintf("healthy:%d", r.Dish.HealthyScore))
			}
		case "most_tasty":
			if r.Dish.TastyScore > 0 {
				meta = append(meta, fmt.Sprintf("tasty:%d", r.Dish.TastyScore))
			}
		case "rescue_meal":
			if len(inventoryNames) > 0 {
				match := MatchDishToInventory(r.Dish, BuildHaveIngredientSet(nil, inventoryNames))
				if match.Coverage > 0 {
					meta = append(meta, fmt.Sprintf("pantry:%.0f%%", match.Coverage*100))
				}
			}
			if len(expiringNames) > 0 {
				if used := InventoryItemsUsedByDish(r.Dish, expiringNames); len(used) > 0 {
					meta = append(meta, "uses-expiring: "+strings.Join(used, ", "))
				}
			}
		}
		if r.Dish.HalfLifeDays > 0 {
			meta = append(meta, fmt.Sprintf("half-life %dd", r.Dish.HalfLifeDays))
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
