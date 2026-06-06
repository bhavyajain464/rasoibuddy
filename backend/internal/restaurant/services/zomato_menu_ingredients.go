package services

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
)

//go:embed zomato_choudhary_menu.json
var embeddedZomatoChoudharyMenu []byte

var (
	zomatoIngredientMap     map[string][]string
	zomatoIngredientMapOnce sync.Once
)

type zomatoChoudharyMenuFile struct {
	Dishes []struct {
		Name        string   `json:"name"`
		Ingredients []string `json:"ingredients"`
	} `json:"dishes"`
}

func normalizeDishName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	repl := strings.NewReplacer(",", " ", "/", " ", "-", " ", "(", " ", ")", " ", "'", " ")
	name = repl.Replace(name)
	return strings.Join(strings.Fields(name), " ")
}

func loadZomatoIngredientMap() {
	zomatoIngredientMapOnce.Do(func() {
		zomatoIngredientMap = make(map[string][]string)
		var file zomatoChoudharyMenuFile
		if err := json.Unmarshal(embeddedZomatoChoudharyMenu, &file); err != nil {
			return
		}
		for _, d := range file.Dishes {
			key := normalizeDishName(d.Name)
			if key == "" || len(d.Ingredients) == 0 {
				continue
			}
			zomatoIngredientMap[key] = d.Ingredients
		}
	})
}

func zomatoIngredientsForDish(name string) []string {
	loadZomatoIngredientMap()
	key := normalizeDishName(name)
	if ings, ok := zomatoIngredientMap[key]; ok {
		out := make([]string, len(ings))
		copy(out, ings)
		return out
	}
	return []string{"onion", "tomato", "ginger garlic paste", "turmeric", "coriander powder"}
}

func attachZomatoIngredients(dishes []ZomatoMenuDish) {
	for i := range dishes {
		dishes[i].Ingredients = zomatoIngredientsForDish(dishes[i].Name)
	}
}
