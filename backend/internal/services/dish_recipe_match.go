package services

import (
	"encoding/json"
	"strings"
)

// ExternalRecipe is a normalized recipe from an external source (e.g. RasoiBuddy scrape).
type ExternalRecipe struct {
	ID              string   `json:"id"`
	URL             string   `json:"url"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	PrepTimeMinutes int      `json:"prep_time_minutes"`
	CookTimeMinutes int      `json:"cook_time_minutes"`
	TotalTimeMinutes int     `json:"total_time_minutes"`
	Yield           string   `json:"yield"`
	Ingredients     []string `json:"ingredients"`
	Instructions    []string `json:"instructions"`
	Images          []string `json:"images"`
	Nutrition       any      `json:"nutrition"`
	Source          string   `json:"source"`
}

// DishRecipeMatch pairs a catalog dish with an external recipe.
type DishRecipeMatch struct {
	Dish           CatalogDish
	Recipe         ExternalRecipe
	Method         string
	Confidence     float64
}

// IndexExternalRecipes dedupes scraped recipes by slug (prefers entries without ?lang=hi).
func IndexExternalRecipes(recipes []ExternalRecipe) map[string]ExternalRecipe {
	out := map[string]ExternalRecipe{}
	for _, r := range recipes {
		id := strings.Split(strings.TrimSpace(r.ID), "?")[0]
		if id == "" {
			continue
		}
		existing, ok := out[id]
		if !ok || (strings.Contains(existing.ID, "?lang=") && !strings.Contains(r.ID, "?lang=")) {
			r.ID = id
			out[id] = r
		}
	}
	return out
}

// MatchCatalogDishesToRecipes maps each catalog dish to the best external recipe.
func MatchCatalogDishesToRecipes(catalog []CatalogDish, recipes []ExternalRecipe) ([]DishRecipeMatch, []CatalogDish) {
	byID := IndexExternalRecipes(recipes)
	byName := map[string]ExternalRecipe{}
	for _, r := range byID {
		key := NormalizeDishName(r.Name)
		if key != "" {
			byName[key] = r
		}
	}

	var matched []DishRecipeMatch
	var unmatched []CatalogDish
	for _, dish := range catalog {
		if m, ok := matchOneDish(dish, byID, byName); ok {
			matched = append(matched, m)
		} else {
			unmatched = append(unmatched, dish)
		}
	}
	return matched, unmatched
}

func matchOneDish(dish CatalogDish, byID map[string]ExternalRecipe, byName map[string]ExternalRecipe) (DishRecipeMatch, bool) {
	if r, ok := byID[dish.ID]; ok {
		return DishRecipeMatch{Dish: dish, Recipe: r, Method: "exact_slug", Confidence: 1.0}, true
	}
	for _, key := range []string{NormalizeDishName(dish.Name), NormalizeDishName(dish.DisplayLabel())} {
		if key == "" {
			continue
		}
		if r, ok := byName[key]; ok {
			return DishRecipeMatch{Dish: dish, Recipe: r, Method: "name", Confidence: 0.95}, true
		}
	}

	// Relaxed slug: strip suffixes like -plate, plain-
	base := dish.ID
	for _, suffix := range []string{"-plate", "-dinner", "-breakfast", "-restaurant-style"} {
		if strings.HasSuffix(base, suffix) {
			base = strings.TrimSuffix(base, suffix)
		}
	}
	if strings.HasPrefix(base, "plain-") {
		base = strings.TrimPrefix(base, "plain-")
	}
	if r, ok := byID[base]; ok {
		return DishRecipeMatch{Dish: dish, Recipe: r, Method: "relaxed_slug", Confidence: 0.9}, true
	}

	// Prefix match on slug
	var best ExternalRecipe
	bestLen := 0
	for slug, r := range byID {
		if strings.HasPrefix(slug, dish.ID+"-") || strings.HasPrefix(dish.ID, slug+"-") {
			if len(slug) > bestLen {
				best = r
				bestLen = len(slug)
			}
		}
	}
	if bestLen > 0 {
		return DishRecipeMatch{Dish: dish, Recipe: best, Method: "prefix_slug", Confidence: 0.85}, true
	}

	return DishRecipeMatch{}, false
}

// ParseExternalRecipesJSON loads recipes.json array.
func ParseExternalRecipesJSON(data []byte) ([]ExternalRecipe, error) {
	var recipes []ExternalRecipe
	if err := json.Unmarshal(data, &recipes); err != nil {
		return nil, err
	}
	return recipes, nil
}

// DishRecipeRow is the API/DB shape for a catalog recipe.
type DishRecipeRow struct {
	DishID           string   `json:"dish_id"`
	Source           string   `json:"source"`
	SourceURL        string   `json:"source_url,omitempty"`
	SourceRecipeID   string   `json:"source_recipe_id,omitempty"`
	Title            string   `json:"title"`
	Description      string   `json:"description,omitempty"`
	PrepTimeMinutes  int      `json:"prep_time_minutes,omitempty"`
	CookTimeMinutes  int      `json:"cook_time_minutes,omitempty"`
	TotalTimeMinutes int      `json:"total_time_minutes,omitempty"`
	Yield            string   `json:"yield,omitempty"`
	Ingredients      []string `json:"ingredients"`
	Instructions     []string `json:"instructions"`
	Images           []string `json:"images,omitempty"`
	MatchMethod      string   `json:"match_method,omitempty"`
}

func DishRecipeRowFromMatch(m DishRecipeMatch) DishRecipeRow {
	r := m.Recipe
	source := strings.TrimSpace(r.Source)
	if source == "" {
		source = "rasoibuddy.in"
	}
	title := strings.TrimSpace(r.Name)
	if title == "" {
		title = m.Dish.DisplayLabel()
	}
	return DishRecipeRow{
		DishID:           m.Dish.ID,
		Source:           source,
		SourceURL:        strings.TrimSpace(r.URL),
		SourceRecipeID:   strings.TrimSpace(r.ID),
		Title:            title,
		Description:      strings.TrimSpace(r.Description),
		PrepTimeMinutes:  r.PrepTimeMinutes,
		CookTimeMinutes:  r.CookTimeMinutes,
		TotalTimeMinutes: r.TotalTimeMinutes,
		Yield:            strings.TrimSpace(r.Yield),
		Ingredients:      append([]string(nil), r.Ingredients...),
		Instructions:     append([]string(nil), r.Instructions...),
		Images:           append([]string(nil), r.Images...),
		MatchMethod:      m.Method,
	}
}
