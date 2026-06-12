package ingredients

import (
	_ "embed"
	"encoding/json"
	"log"
	"sort"
	"strings"
	"sync"

	"kitchenai-backend/pkg/units"
)

// CatalogIngredient is one row exposed to the inventory/shopping UI.
type CatalogIngredient struct {
	IngredientID string   `json:"ingredient_id"`
	Name         string   `json:"name"`
	DefaultUnit  string   `json:"default_unit"`
	FoodGroup    string   `json:"food_group,omitempty"`
	Synonyms     []string `json:"synonyms,omitempty"`
}

type rawEntry struct {
	ID        string   `json:"id"`
	Canonical string   `json:"canonical"`
	Category  string   `json:"category"`
	Synonyms  []string `json:"synonyms"`
}

type rawFile struct {
	Ingredients []rawEntry `json:"ingredients"`
}

//go:embed catalog.json
var embeddedCatalog []byte

var (
	catalogOnce sync.Once
	catalogAll  []CatalogIngredient
)

func loadCatalog() {
	catalogOnce.Do(func() {
		var raw rawFile
		if err := json.Unmarshal(embeddedCatalog, &raw); err != nil {
			log.Printf("[ingredients] failed to load catalog: %v", err)
			catalogAll = nil
			return
		}
		out := make([]CatalogIngredient, 0, len(raw.Ingredients))
		for _, e := range raw.Ingredients {
			id := strings.TrimSpace(e.ID)
			name := strings.TrimSpace(e.Canonical)
			if id == "" || name == "" {
				continue
			}
			out = append(out, CatalogIngredient{
				IngredientID: id,
				Name:         name,
				DefaultUnit:  defaultUnitForCategory(e.Category),
				FoodGroup:    foodGroupForCategory(e.Category),
				Synonyms:     e.Synonyms,
			})
		}
		sort.Slice(out, func(i, j int) bool {
			return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
		})
		catalogAll = out
		log.Printf("[ingredients] loaded %d catalog entries", len(catalogAll))
	})
}

// Catalog returns all ingredients sorted by name.
func Catalog() []CatalogIngredient {
	loadCatalog()
	out := make([]CatalogIngredient, len(catalogAll))
	copy(out, catalogAll)
	return out
}

// Search returns ingredients whose canonical name or synonyms match query (case-insensitive).
// Empty query returns the full catalog.
func Search(query string) []CatalogIngredient {
	loadCatalog()
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return Catalog()
	}
	out := make([]CatalogIngredient, 0, 32)
	for _, item := range catalogAll {
		if matchesIngredient(item, q) {
			out = append(out, item)
		}
	}
	return out
}

func matchesIngredient(item CatalogIngredient, q string) bool {
	if strings.Contains(strings.ToLower(item.Name), q) {
		return true
	}
	if strings.Contains(strings.ToLower(item.IngredientID), q) {
		return true
	}
	for _, syn := range item.Synonyms {
		if strings.Contains(strings.ToLower(syn), q) {
			return true
		}
	}
	return false
}

func defaultUnitForCategory(category string) string {
	switch strings.TrimSpace(category) {
	case "oils_fats", "beverages", "condiments_sauces":
		return "ml"
	case "vegetables", "leafy_greens", "fruits", "poultry", "meat", "seafood",
		"grains_cereals", "pulses_legumes":
		return "kg"
	case "spices", "spice_blends", "herbs", "flours", "nuts", "seeds", "dry_fruits",
		"baking", "sweeteners", "dairy":
		return "g"
	case "eggs", "staples_packaged", "other":
		return "pcs"
	default:
		return "pcs"
	}
}

func foodGroupForCategory(category string) string {
	switch strings.TrimSpace(category) {
	case "vegetables", "leafy_greens":
		return "vegetables"
	case "fruits":
		return "fruits"
	case "spices", "spice_blends", "herbs":
		return "spices"
	case "dairy", "eggs":
		return "dairy"
	case "grains_cereals", "pulses_legumes", "flours":
		return "grains_pulses"
	case "oils_fats":
		return "oils_fats"
	case "poultry", "meat", "seafood":
		return "non_veg"
	case "condiments_sauces":
		return "condiments"
	case "baking", "staples_packaged":
		return "bakery"
	case "beverages":
		return "beverages"
	default:
		return "other"
	}
}

// NormalizeUnit ensures API returns canonical unit ids.
func NormalizeUnit(u string) string {
	return units.Normalize(u)
}
