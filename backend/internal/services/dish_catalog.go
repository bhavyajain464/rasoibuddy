package services

import (
	_ "embed"
	"encoding/json"
	"log"
	"math/rand"
	"strings"
	"sync"
)

// CatalogDish is one row in dishes/catalog.json.
// diet: vegan | vegetarian | eggetarian | non-veg
// meal_type: breakfast | lunch | dinner | snack | dessert | side
// ingredients: top important ingredient tokens for matching and display.
type CatalogDish struct {
	ID              string   `json:"id,omitempty"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name,omitempty"`
	Cuisine         string   `json:"cuisine,omitempty"`
	Diet            string   `json:"diet,omitempty"`
	MealType        []string `json:"meal_type,omitempty"`
	KeyIngredients  []string `json:"key_ingredients,omitempty"`
	Ingredients     []string `json:"ingredients,omitempty"` // legacy alias
	Effort          string   `json:"effort,omitempty"`      // low | medium | high
	CookTimeMinutes int      `json:"cook_time_minutes,omitempty"`
	WeekdayFriendly bool     `json:"weekday_friendly,omitempty"`
	OnePot          bool     `json:"one_pot,omitempty"`
	PairsWith       []string `json:"pairs_with,omitempty"`
	FrequencyClass  string   `json:"frequency_class,omitempty"` // daily | weekly | special
	HalfLifeDays    int      `json:"half_life_days,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	SpiceLevel      string   `json:"spice_level,omitempty"`  // mild | medium | spicy
	Allergens       []string `json:"allergens,omitempty"`    // dairy|gluten|nuts|peanut|sesame|soy|egg
	OnionGarlic     bool     `json:"onion_garlic,omitempty"` // contains onion/garlic
	JainSafe        bool     `json:"jain_safe,omitempty"`    // no onion/garlic/root veg
}

// CatalogIngredients returns key_ingredients (or legacy ingredients).
func (d CatalogDish) CatalogIngredients() []string {
	if len(d.KeyIngredients) > 0 {
		return d.KeyIngredients
	}
	return d.Ingredients
}

// HasPracticalMeta is true when effort/time/weekday fields were populated in catalog v2.
func (d CatalogDish) HasPracticalMeta() bool {
	return d.CookTimeMinutes > 0 || strings.TrimSpace(d.Effort) != ""
}

// DisplayLabel is the household-facing name (falls back to name).
func (d CatalogDish) DisplayLabel() string {
	if s := strings.TrimSpace(d.DisplayName); s != "" {
		return s
	}
	return strings.TrimSpace(d.Name)
}

//go:embed dishes/catalog.json
var embeddedDishCatalog []byte

var (
	dishCatalog     []CatalogDish
	dishCatalogOnce sync.Once
)

func loadDishCatalog() {
	dishCatalogOnce.Do(func() {
		if err := json.Unmarshal(embeddedDishCatalog, &dishCatalog); err != nil {
			log.Printf("[dish_catalog] failed to load embedded catalog: %v", err)
			dishCatalog = nil
			return
		}
		log.Printf("[dish_catalog] loaded %d dishes", len(dishCatalog))
	})
}

// DishCatalog returns all catalog dishes (lazy-loaded once).
func DishCatalog() []CatalogDish {
	loadDishCatalog()
	out := make([]CatalogDish, len(dishCatalog))
	copy(out, dishCatalog)
	return out
}

// DishCatalogSize is the number of dishes in the embedded catalog.
func DishCatalogSize() int {
	loadDishCatalog()
	return len(dishCatalog)
}

// NormalizedDiet returns the catalog diet slug in lowercase.
func (d CatalogDish) NormalizedDiet() string {
	return strings.ToLower(strings.TrimSpace(d.Diet))
}

// GlobalStarCount is how many users have starred this dish.
func (d CatalogDish) GlobalStarCount(globalStars map[string]int) int {
	if globalStars == nil {
		return 0
	}
	return globalStars[NormalizeDishName(d.Name)]
}

// RetrievalStarScore is the global star count used for ranking (0 when unstarred by everyone).
func (d CatalogDish) RetrievalStarScore(globalStars map[string]int) float64 {
	return float64(d.GlobalStarCount(globalStars))
}

func (d CatalogDish) featureTokens() map[string]struct{} {
	tokens := map[string]struct{}{}
	add := func(s string) {
		for _, t := range tokenizeForDishes(s) {
			tokens[t] = struct{}{}
		}
	}
	add(d.Name)
	add(d.DisplayLabel())
	add(d.Effort)
	add(d.NormalizedDiet())
	for _, m := range d.MealType {
		add(m)
	}
	for _, ing := range d.CatalogIngredients() {
		add(ing)
	}
	for _, tag := range d.Tags {
		add(tag)
	}
	return tokens
}

func (d CatalogDish) searchBlob() string {
	parts := []string{d.Name, d.DisplayLabel(), d.Cuisine, d.NormalizedDiet(), d.Effort, d.FrequencyClass}
	parts = append(parts, d.MealType...)
	parts = append(parts, d.CatalogIngredients()...)
	parts = append(parts, d.Tags...)
	return strings.ToLower(strings.Join(parts, " "))
}

func tokenizeForDishes(s string) []string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return nil
	}
	repl := strings.NewReplacer(",", " ", "/", " ", "-", " ", "(", " ", ")", " ", "'", " ")
	s = repl.Replace(s)
	parts := strings.Fields(s)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if len(p) < 2 {
			continue
		}
		out = append(out, p)
	}
	return out
}

// UserPromptTokens splits a free-text meal preference into search tokens.
func UserPromptTokens(s string) []string {
	return tokenizeForDishes(s)
}

// DishMatchesPrompt reports whether dish name, ingredients, or meal type contain any prompt token.
func DishMatchesPrompt(d CatalogDish, tokens []string) bool {
	if len(tokens) == 0 {
		return true
	}
	blob := d.searchBlob()
	for _, t := range tokens {
		if strings.Contains(blob, t) {
			return true
		}
	}
	return false
}

// DishAllowedForUserDiet applies profile dietary tags to catalog diet slugs.
func DishAllowedForUserDiet(d CatalogDish, dietaryTags []string) bool {
	if len(dietaryTags) == 0 {
		return true
	}
	dDiet := d.NormalizedDiet()
	wantsVegan := false
	wantsVeg := false
	for _, tag := range dietaryTags {
		lower := strings.ToLower(strings.TrimSpace(tag))
		if strings.Contains(lower, "vegan") {
			wantsVegan = true
		}
		if strings.Contains(lower, "jain") || strings.Contains(lower, "vegetarian") {
			wantsVeg = true
		}
	}
	if wantsVegan {
		return dDiet == "vegan"
	}
	if wantsVeg {
		return dDiet == "vegan" || dDiet == "vegetarian"
	}
	return true
}

// DishHasMealType reports whether the dish is tagged for a meal slot (breakfast, lunch, etc.).
func (d CatalogDish) DishHasMealType(slot string) bool {
	slot = strings.ToLower(strings.TrimSpace(slot))
	for _, m := range d.MealType {
		if strings.ToLower(strings.TrimSpace(m)) == slot {
			return true
		}
	}
	return false
}

var dessertPromptTokens = []string{
	"dessert", "sweet", "sweets", "mithai", "halwa", "kheer", "ladoo",
	"gulab", "jamun", "jalebi", "barfi", "peda", "rasgulla", "pudding", "cake",
	"cookie", "brownie", "icecream", "ice", "chocolate", "pastry", "laddu",
}

// PromptImpliesDessert is true when the user explicitly asks for sweets/dessert in free text.
func PromptImpliesDessert(prompt string) bool {
	blob := strings.ToLower(prompt)
	for _, t := range dessertPromptTokens {
		if strings.Contains(blob, t) {
			return true
		}
	}
	return false
}

// ResolveEffectiveMealTypeFilter applies UI selection; default lunch/dinner unless prompt asks for dessert.
func ResolveEffectiveMealTypeFilter(param, userPrompt string) string {
	param = strings.ToLower(strings.TrimSpace(param))
	if param == "" {
		param = "lunch_dinner"
	}
	if param == "lunch_dinner" && PromptImpliesDessert(userPrompt) {
		return "dessert"
	}
	return param
}

// DishMatchesMealTypeFilter limits catalog rows by meal slot (lunch_dinner = lunch or dinner only).
func DishMatchesMealTypeFilter(d CatalogDish, filter string) bool {
	switch strings.ToLower(strings.TrimSpace(filter)) {
	case "", "all":
		return true
	case "lunch_dinner":
		return d.DishHasMealType("lunch") || d.DishHasMealType("dinner")
	case "breakfast", "lunch", "dinner", "snack", "dessert", "side":
		return d.DishHasMealType(filter)
	default:
		return d.DishHasMealType("lunch") || d.DishHasMealType("dinner")
	}
}

// MealTypeFilterLabel is a short phrase for Groq prompts (pass the effective filter).
func MealTypeFilterLabel(filter string) string {
	switch strings.ToLower(strings.TrimSpace(filter)) {
	case "breakfast":
		return "breakfast"
	case "snack":
		return "snack"
	case "dessert":
		return "dessert or sweets"
	case "all":
		return "any meal slot"
	default:
		return "lunch or dinner (main meals, not dessert-only)"
	}
}

// DishMatchesUICategory maps Meals-screen category ids to catalog meal_type tags.
func DishMatchesUICategory(d CatalogDish, uiCategory string) bool {
	cat := strings.ToLower(strings.TrimSpace(uiCategory))
	if cat == "" || cat == "daily" {
		return true
	}
	switch cat {
	case "meal_of_day", "most_healthy", "most_tasty", "long_lasting", "rescue_meal":
		return d.DishHasMealType("breakfast") ||
			d.DishHasMealType("lunch") ||
			d.DishHasMealType("dinner") ||
			d.DishHasMealType("snack")
	default:
		return true
	}
}

// BestCandidateForPrompt returns the highest-ranked shortlist dish matching the prompt, or the top pick.
func BestCandidateForPrompt(candidates []RankedDish, prompt string) (RankedDish, bool) {
	pool := MatchingCandidatesForPrompt(candidates, prompt, nil)
	if len(pool) > 0 {
		return pool[0], true
	}
	if len(candidates) > 0 {
		return candidates[0], true
	}
	return RankedDish{}, false
}

func excludeDishSet(exclude []string) map[string]bool {
	set := make(map[string]bool, len(exclude)*2)
	for _, name := range exclude {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		set[strings.ToLower(name)] = true
		set[NormalizeDishName(name)] = true
	}
	return set
}

// MatchingCandidatesForPrompt returns shortlist dishes matching the prompt, minus excluded names.
func MatchingCandidatesForPrompt(candidates []RankedDish, prompt string, exclude []string) []RankedDish {
	if len(candidates) == 0 {
		return nil
	}
	tokens := UserPromptTokens(prompt)
	ex := excludeDishSet(exclude)
	out := make([]RankedDish, 0, len(candidates))
	for _, c := range candidates {
		if len(tokens) > 0 && !DishMatchesPrompt(c.Dish, tokens) {
			continue
		}
		key := NormalizeDishName(c.Dish.Name)
		if ex[key] || ex[strings.ToLower(strings.TrimSpace(c.Dish.Name))] || ex[strings.ToLower(strings.TrimSpace(c.Dish.DisplayLabel()))] {
			continue
		}
		out = append(out, c)
	}
	return out
}

// RandomCandidateForPrompt picks uniformly from prompt-matching shortlist dishes (for regenerate variety).
func RandomCandidateForPrompt(candidates []RankedDish, prompt string, exclude []string) (RankedDish, bool) {
	pool := MatchingCandidatesForPrompt(candidates, prompt, exclude)
	if len(pool) == 0 {
		pool = MatchingCandidatesForPrompt(candidates, prompt, nil)
	}
	if len(pool) == 0 {
		ex := excludeDishSet(exclude)
		for _, c := range candidates {
			key := NormalizeDishName(c.Dish.Name)
			if !ex[key] && !ex[strings.ToLower(strings.TrimSpace(c.Dish.Name))] && !ex[strings.ToLower(strings.TrimSpace(c.Dish.DisplayLabel()))] {
				pool = append(pool, c)
			}
		}
	}
	if len(pool) == 0 && len(candidates) > 0 {
		pool = candidates
	}
	if len(pool) == 0 {
		return RankedDish{}, false
	}
	return pool[rand.Intn(len(pool))], true
}
