package services

import "strings"

// Groups of interchangeable grocery names (any member in pantry covers the others).
var grocerySubstituteGroups = [][]string{
	{"atta", "wheat flour", "whole wheat flour", "maida", "flour", "wheat"},
	{"roti", "rotis", "chapati", "chapatis", "paratha", "parathas", "naan", "poori", "puri", "bhatura", "phulka", "fulka"},
	{"rice", "chawal", "basmati", "steamed rice"},
	{"dal", "daal", "lentil", "lentils", "toor dal", "moong dal", "masoor dal"},
	{"curd", "dahi", "yogurt", "yoghurt"},
	{"milk", "doodh"},
	{"paneer", "cottage cheese"},
	{"onion", "pyaaz", "pyaz"},
	{"potato", "aloo", "potatoes"},
	{"tomato", "tamatar", "tomatoes"},
	{"egg", "eggs", "anda"},
	{"oil", "cooking oil", "vegetable oil"},
	{"ghee", "clarified butter"},
	{"sugar", "cheeni"},
	{"salt", "namak"},
}

// If pantry has something from Has, treat Covers as already available (e.g. atta → don't buy roti).
var pantryImpliedCoverage = []struct {
	Has    []string
	Covers []string
}{
	{
		Has:    []string{"atta", "wheat flour", "whole wheat flour", "maida", "flour", "wheat"},
		Covers: []string{"roti", "rotis", "chapati", "chapatis", "paratha", "parathas", "naan", "poori", "puri", "bhatura", "phulka", "fulka", "bread", "bread slices"},
	},
	{
		Has:    []string{"rice", "chawal", "basmati"},
		Covers: []string{"steamed rice", "jeera rice", "cooked rice", "chawal"},
	},
	{
		Has:    []string{"curd", "dahi", "yogurt"},
		Covers: []string{"raita", "lassi"},
	},
	{
		Has:    []string{"milk", "doodh"},
		Covers: []string{"milk powder"},
	},
}

func normalizeIngredientAlias(token string) string {
	token = strings.ToLower(strings.TrimSpace(token))
	if token == "" {
		return token
	}
	aliases := map[string]string{
		"rotis": "roti", "chapatis": "chapati", "parathas": "paratha",
		"tomatoes": "tomato", "onions": "onion", "potatoes": "potato",
		"eggs": "egg", "lemons": "lemon", "limes": "lime",
	}
	if a, ok := aliases[token]; ok {
		return a
	}
	if strings.HasSuffix(token, "ies") && len(token) > 4 {
		return token[:len(token)-3] + "y"
	}
	if strings.HasSuffix(token, "es") && len(token) > 3 {
		base := token[:len(token)-2]
		if base != "rice" && base != "cheese" {
			return base
		}
	}
	if strings.HasSuffix(token, "s") && len(token) > 3 && !strings.HasSuffix(token, "ss") {
		return token[:len(token)-1]
	}
	return token
}

func stringMatchesGroceryMember(s string, members []string) bool {
	sNorm := normalizeGroceryToken(s)
	sToks := groceryTokens(s)
	for _, m := range members {
		mNorm := normalizeGroceryToken(m)
		if mNorm != "" && (sNorm == mNorm || strings.Contains(sNorm, mNorm) || strings.Contains(mNorm, sNorm)) {
			return true
		}
		for _, st := range sToks {
			st = normalizeIngredientAlias(st)
			for _, mt := range groceryTokens(m) {
				mt = normalizeIngredientAlias(mt)
				if st == mt || (len(st) >= 3 && len(mt) >= 3 && (strings.Contains(st, mt) || strings.Contains(mt, st))) {
					return true
				}
			}
		}
	}
	return false
}

func addPantryCoverageKeys(covered map[string]struct{}, name string) {
	for _, t := range groceryTokens(name) {
		t = normalizeIngredientAlias(t)
		if len(t) >= 2 {
			covered[t] = struct{}{}
		}
	}
	norm := normalizeGroceryToken(name)
	if norm != "" {
		covered[norm] = struct{}{}
	}
}

func buildPantryCoverageSet(pantry []string) map[string]struct{} {
	covered := map[string]struct{}{}
	for _, p := range pantry {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		addPantryCoverageKeys(covered, p)

		for _, group := range grocerySubstituteGroups {
			if stringMatchesGroceryMember(p, group) {
				for _, m := range group {
					addPantryCoverageKeys(covered, m)
				}
			}
		}
		for _, rule := range pantryImpliedCoverage {
			if stringMatchesGroceryMember(p, rule.Has) {
				for _, m := range rule.Covers {
					addPantryCoverageKeys(covered, m)
				}
			}
		}
	}
	return covered
}

func itemCoveredByPantry(item string, pantry []string) bool {
	if strings.TrimSpace(item) == "" || len(pantry) == 0 {
		return false
	}
	covered := buildPantryCoverageSet(pantry)

	for _, t := range groceryTokens(item) {
		t = normalizeIngredientAlias(t)
		if len(t) < 2 {
			continue
		}
		if _, ok := covered[t]; ok {
			return true
		}
		for key := range covered {
			if len(key) >= 3 && (strings.Contains(key, t) || strings.Contains(t, key)) {
				return true
			}
		}
	}
	itemNorm := normalizeGroceryToken(item)
	for key := range covered {
		if len(key) >= 3 && len(itemNorm) >= 3 && (strings.Contains(itemNorm, key) || strings.Contains(key, itemNorm)) {
			return true
		}
	}
	return false
}

// IngredientMatchesPantry reports whether ingredientName is covered by any pantry item name.
func IngredientMatchesPantry(ingredientName string, pantryNames []string) bool {
	return itemCoveredByPantry(ingredientName, pantryNames)
}
