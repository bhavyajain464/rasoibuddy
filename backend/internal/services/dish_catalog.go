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
	Name        string   `json:"name"`
	Cuisine     string   `json:"cuisine,omitempty"`
	Diet        string   `json:"diet,omitempty"`
	MealType    []string `json:"meal_type,omitempty"`
	Ingredients []string `json:"ingredients,omitempty"`
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

func (d CatalogDish) featureTokens() map[string]struct{} {
	tokens := map[string]struct{}{}
	add := func(s string) {
		for _, t := range tokenizeForDishes(s) {
			tokens[t] = struct{}{}
		}
	}
	add(d.Name)
	add(d.Cuisine)
	add(d.NormalizedDiet())
	for _, m := range d.MealType {
		add(m)
	}
	for _, ing := range d.Ingredients {
		add(ing)
	}
	return tokens
}

func (d CatalogDish) searchBlob() string {
	parts := []string{d.Name, d.Cuisine, d.NormalizedDiet()}
	parts = append(parts, d.MealType...)
	parts = append(parts, d.Ingredients...)
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
	set := make(map[string]bool, len(exclude))
	for _, name := range exclude {
		key := strings.ToLower(strings.TrimSpace(name))
		if key != "" {
			set[key] = true
		}
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
		if ex[strings.ToLower(strings.TrimSpace(c.Dish.Name))] {
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
			if !ex[strings.ToLower(strings.TrimSpace(c.Dish.Name))] {
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
