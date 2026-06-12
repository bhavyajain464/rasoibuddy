package ingredients

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
)

// MatchResult is a catalog hit for a free-form grocery name.
type MatchResult struct {
	Ingredient CatalogIngredient
	MatchedVia string // canonical | id | synonym | contains
}

type resolverIndex struct {
	byCanonical map[string]CatalogIngredient
	byID        map[string]CatalogIngredient
	bySynonym   map[string]CatalogIngredient
	ambiguous   map[string]bool
	all         []CatalogIngredient
}

var (
	resolverOnce sync.Once
	resolver     *resolverIndex
)

func normalizeKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	repl := strings.NewReplacer(",", " ", "/", " ", "-", " ", "_", " ", "(", " ", ")", " ", "'", " ")
	s = repl.Replace(s)
	return strings.Join(strings.Fields(s), " ")
}

func loadResolver() {
	resolverOnce.Do(func() {
		loadCatalog()
		var raw struct {
			AmbiguousAliases map[string][]string `json:"ambiguous_aliases"`
			Ingredients      []rawEntry          `json:"ingredients"`
		}
		if err := json.Unmarshal(embeddedCatalog, &raw); err != nil {
			log.Printf("[ingredients] resolver: failed to parse catalog: %v", err)
			resolver = &resolverIndex{
				byCanonical: map[string]CatalogIngredient{},
				byID:        map[string]CatalogIngredient{},
				bySynonym:   map[string]CatalogIngredient{},
				ambiguous:   map[string]bool{},
			}
			return
		}

		idx := &resolverIndex{
			byCanonical: map[string]CatalogIngredient{},
			byID:        map[string]CatalogIngredient{},
			bySynonym:   map[string]CatalogIngredient{},
			ambiguous:   map[string]bool{},
			all:         catalogAll,
		}
		for key := range raw.AmbiguousAliases {
			if k := normalizeKey(key); k != "" {
				idx.ambiguous[k] = true
			}
		}

		for _, item := range catalogAll {
			if k := normalizeKey(item.Name); k != "" {
				idx.byCanonical[k] = item
			}
			if k := normalizeKey(item.IngredientID); k != "" {
				idx.byID[k] = item
			}
			for _, syn := range item.Synonyms {
				k := normalizeKey(syn)
				if k == "" || idx.ambiguous[k] {
					continue
				}
				if _, exists := idx.bySynonym[k]; !exists {
					idx.bySynonym[k] = item
				}
			}
		}
		resolver = idx
	})
}

// Resolve maps a stored inventory/shopping name to a catalog ingredient.
func Resolve(name string) (MatchResult, bool) {
	loadResolver()
	if resolver == nil {
		return MatchResult{}, false
	}
	key := normalizeKey(name)
	if key == "" {
		return MatchResult{}, false
	}

	if item, ok := resolver.byCanonical[key]; ok {
		return MatchResult{Ingredient: item, MatchedVia: "canonical"}, true
	}
	if item, ok := resolver.byID[key]; ok {
		return MatchResult{Ingredient: item, MatchedVia: "id"}, true
	}
	if !resolver.ambiguous[key] {
		if item, ok := resolver.bySynonym[key]; ok {
			return MatchResult{Ingredient: item, MatchedVia: "synonym"}, true
		}
	}

	// Substring fallback: prefer longest canonical name contained in the query.
	var best *CatalogIngredient
	bestLen := 0
	for i := range resolver.all {
		item := resolver.all[i]
		canon := normalizeKey(item.Name)
		if canon == "" {
			continue
		}
		if strings.Contains(key, canon) || strings.Contains(canon, key) {
			if len(canon) > bestLen {
				best = &item
				bestLen = len(canon)
			}
		}
	}
	if best != nil {
		return MatchResult{Ingredient: *best, MatchedVia: "contains"}, true
	}
	return MatchResult{}, false
}
