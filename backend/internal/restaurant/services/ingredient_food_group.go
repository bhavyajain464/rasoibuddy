package services

import "strings"

// InferFoodGroupFromName assigns a pantry group from an ingredient name (Indian restaurant catalog).
func InferFoodGroupFromName(name string) string {
	n := normalizeIngredientName(name)
	if n == "" {
		return "other"
	}
	if g, ok := exactIngredientFoodGroups[n]; ok {
		return normalizeInventoryFoodGroup(g)
	}
	// Longer / more specific phrases first.
	for _, rule := range ingredientFoodGroupRules {
		if rule.match(n) {
			return normalizeInventoryFoodGroup(rule.group)
		}
	}
	return "other"
}

type foodGroupRule struct {
	group string
	match func(string) bool
}

var exactIngredientFoodGroups = map[string]string{
	"salt": "spices", "sugar": "other", "honey": "other",
	"onion": "vegetables", "tomato": "vegetables", "potato": "vegetables",
	"ginger": "vegetables", "garlic": "vegetables",
	"paneer": "dairy", "curd": "dairy", "milk": "dairy",
	"toor dal": "grains_pulses", "moong dal": "grains_pulses", "chana dal": "grains_pulses",
	"basmati rice": "grains_pulses", "cooking oil": "oils_fats",
}

var ingredientFoodGroupRules = []foodGroupRule{
	{group: "non_veg", match: containsAny("chicken", "mutton", "lamb", "fish", "prawn", "shrimp", "egg", "meat", "keema", "sausage", "bacon", "seafood", "pork", "beef")},
	{group: "bakery", match: containsAny("bread", " bun", "bun ", "pav", "naan", "kulcha", "roti", "tortilla", "burger bun")},
	{group: "beverages", match: containsAny("tea", "coffee", "juice", "squash", "soda", "cola", "sharbat", "syrup", "lassi", "milkshake")},
	{group: "oils_fats", match: containsAny(" oil", "oil ", "ghee", "vanaspati", "shortening", "cooking oil")},
	{group: "dairy", match: containsAny("milk", "paneer", "curd", "yogurt", "dahi", "butter", "cream", "cheese", "khoya", "mawa", "malai")},
	{group: "grains_pulses", match: containsAny(
		"rice", " dal", "dal ", "lentil", "pulse", "urad", "moong", "chana", "chickpea", "rajma",
		"besan", "atta", "flour", "wheat", "semolina", "rava", "suji", "oats", "pasta", "boondi",
		"masoor", "toor", "pigeon pea", "matar",
	)},
	{group: "spices", match: containsAny(
		"masala", "powder", "spice", "turmeric", "cumin", "cardamom", "ajwain", "clove",
		"cinnamon", "nutmeg", "mace", "fenugreek", "methi", "saffron", "anise", "mustard seed",
		"bay leaf", "garam", "chaat", "biryani masala", "chole masala", "coriander powder",
		"chilli powder", "red chilli powder", "cumin powder", "black pepper", "white pepper", "peppercorn",
	)},
	{group: "fruits", match: containsAny("apple", "banana", "mango", "orange", "grape", "papaya", "pineapple", "berry", "melon", "pomegranate", "guava")},
	{group: "vegetables", match: containsAny(
		"onion", "tomato", "potato", "ginger", "garlic", "carrot", "capsicum", "bell pepper",
		"cauliflower", "cabbage", "cucumber", "spinach", "palak", "methi leaf", "coriander",
		"mint", "lemon", "lime", "green chilli", "chilli", "beans", "bean", "peas",
		"mushroom", "broccoli", "zucchini", "eggplant", "brinjal", "okra", "ladyfinger",
		"beetroot", "radish", "turnip", "lettuce", "celery", "spring onion",
	)},
	{group: "condiments", match: containsAny("sauce", "ketchup", "vinegar", "pickle", "paste", "soy", "mayonnaise", "mustard", "tamarind", "chutney")},
}

func containsAny(terms ...string) func(string) bool {
	return func(name string) bool {
		for _, t := range terms {
			t = strings.TrimSpace(strings.ToLower(t))
			if t == "" {
				continue
			}
			if strings.Contains(name, t) {
				return true
			}
		}
		return false
	}
}
