package services

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/units"
)

var (
	ErrOrderSuggestNoMeals     = errors.New("no meal history for suggestions")
	ErrOrderSuggestNotConfigured = errors.New("groq API key not configured")
	ErrOrderSuggestGroq        = errors.New("groq request failed")
	ErrOrderSuggestParse       = errors.New("could not parse groq response")
)

const orderSuggestSystemPrompt = `You suggest grocery items for an Indian household kitchen app.
Output ONLY valid JSON (no markdown). Schema:
{"items":[{"name":"string","qty":number,"unit":"pcs|kg|g|L|ml","reason":"short"}],"summary":"one sentence"}
Rules:
- Suggest items NOT in pantry and NOT already on shopping list.
- Use BOTH meal history and catalog.json ingredient profiles provided in the user message.
- Prioritize catalog-derived staples that are missing from pantry and needed for meals they cook often.
- Use simple English grocery names (onion, tomato, paneer, atta).
- NEVER suggest bundled names like "mixed vegetables" or "whole spices" — list specific items (carrot, french beans, cauliflower, peas, capsicum, cumin seeds, etc.).
- NEVER suggest roti, chapati, paratha, naan, or bread if atta, wheat flour, or maida is already in pantry (they make bread at home).
- NEVER suggest steamed rice or jeera rice if rice or chawal is in pantry.
- Do not repeat items listed under "already suggested this session".
- qty may be 0 if unknown; unit defaults to pcs.
- Maximum 4 items. If nothing to suggest, return {"items":[],"summary":"brief explanation"}.`

// OrderSuggestItem is one grocery line to buy.
type OrderSuggestItem struct {
	Name   string  `json:"name"`
	Qty    float64 `json:"qty"`
	Unit   string  `json:"unit"`
	Reason string  `json:"reason"`
}

// OrderSuggestResult is the API payload for shopping order suggestions.
type OrderSuggestResult struct {
	Items       []OrderSuggestItem `json:"items"`
	Summary     string             `json:"summary"`
	Source      string             `json:"source"` // ai | empty
	GeneratedAt string             `json:"generated_at"`
}

// OrderSuggestInput gathers household context for Groq.
type OrderSuggestInput struct {
	EatenLog     []CookedLogEntry
	Inventory    []string
	ShoppingList []string
	DietaryTags  []string
	Allergies    []string
	Dislikes     []string
	FavCuisines  []string
	Memories     []string
	ExcludeItems []string // names to skip on refresh (avoid repeating last batch)
}

type frequentDish struct {
	Name  string
	Count int
}

// SuggestOrderItems uses meal history + Groq only (no rule-based fallback list).
func SuggestOrderItems(ctx context.Context, cfg *config.Config, in OrderSuggestInput) (OrderSuggestResult, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	suggestCtx := buildOrderSuggestContext(in)

	if !suggestCtx.hasSignal() {
		return OrderSuggestResult{}, ErrOrderSuggestNoMeals
	}

	if cfg == nil || !cfg.HasGroqAPIKey() {
		return OrderSuggestResult{}, ErrOrderSuggestNotConfigured
	}

	prompt := buildOrderSuggestPrompt(suggestCtx, in)
	log.Printf("[order_suggest] prompt context: eaten_catalog=%d unmatched=%d related=%d missing_staples=%d",
		len(suggestCtx.EatenRows), len(suggestCtx.UnmatchedEaten), len(suggestCtx.RelatedDishes), len(suggestCtx.MissingStaples))
	seed := randomGroqSeed()
	text, err := GroqChatOrderSuggest(ctx, cfg.PickGroqAPIKey(), cfg.EffectiveGroqModel(), prompt, seed)
	if err != nil {
		log.Printf("[order_suggest] groq error: %v", err)
		return OrderSuggestResult{}, fmt.Errorf("%w: %v", ErrOrderSuggestGroq, err)
	}

	parsed, err := parseOrderSuggestJSON(text)
	if err != nil {
		log.Printf("[order_suggest] parse error: %v; raw=%q", err, truncateForLog(text, 400))
		return OrderSuggestResult{}, fmt.Errorf("%w: %v", ErrOrderSuggestParse, err)
	}

	pantry := append([]string{}, in.Inventory...)
	pantry = append(pantry, in.ShoppingList...)
	exclude := append([]string{}, in.ExcludeItems...)
	filtered := make([]OrderSuggestItem, 0, len(parsed.Items))
	seenNames := map[string]bool{}
	for _, it := range parsed.Items {
		names := expandOrderSuggestNames(it.Name)
		reason := strings.TrimSpace(it.Reason)
		unit := units.Normalize(it.Unit)
		qty := it.Qty
		if qty < 0 {
			qty = 0
		}
		for _, name := range names {
			if name == "" || itemCoveredByPantry(name, pantry) || itemCoveredByPantry(name, exclude) {
				continue
			}
			key := NormalizeDishName(name)
			if seenNames[key] {
				continue
			}
			seenNames[key] = true
			itemReason := reason
			if isBlockedShoppingName(it.Name) && itemReason == "" {
				itemReason = "For your usual veg rice / curry dishes"
			}
			filtered = append(filtered, OrderSuggestItem{
				Name:   name,
				Qty:    qty,
				Unit:   unit,
				Reason: itemReason,
			})
			if len(filtered) >= 4 {
				break
			}
		}
		if len(filtered) >= 4 {
			break
		}
	}

	summary := strings.TrimSpace(parsed.Summary)
	if summary == "" {
		if len(filtered) == 0 {
			summary = "Nothing to order right now — your pantry covers what you cook often."
		} else {
			summary = "Staples to pick up for your usual meals."
		}
	}

	source := "ai"
	if len(filtered) == 0 {
		source = "empty"
	}

	return OrderSuggestResult{
		Items:       filtered,
		Summary:     summary,
		Source:      source,
		GeneratedAt: now,
	}, nil
}

func truncateForLog(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func countFrequentEatenDishes(entries []CookedLogEntry, max int) []frequentDish {
	counts := map[string]int{}
	display := map[string]string{}
	for _, e := range entries {
		name := strings.TrimSpace(e.DishName)
		if name == "" {
			continue
		}
		key := NormalizeDishName(name)
		counts[key]++
		if _, ok := display[key]; !ok {
			display[key] = name
		}
	}
	list := make([]frequentDish, 0, len(counts))
	for key, n := range counts {
		list = append(list, frequentDish{Name: display[key], Count: n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Count != list[j].Count {
			return list[i].Count > list[j].Count
		}
		return list[i].Name < list[j].Name
	})
	if max > 0 && len(list) > max {
		list = list[:max]
	}
	return list
}

func randomGroqSeed() *int64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		n := time.Now().UnixNano()
		return &n
	}
	n := int64(binary.LittleEndian.Uint64(b[:]) & (1<<63 - 1))
	return &n
}

func normalizeGroceryToken(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	repl := strings.NewReplacer(",", " ", "(", " ", ")", " ", "'", " ")
	return strings.TrimSpace(repl.Replace(s))
}

func groceryTokens(s string) []string {
	return tokenizeForDishes(s)
}

func titleIngredientToken(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// FindCatalogDishByName matches a cooked dish name to a catalog row.
func FindCatalogDishByName(dishName string) (CatalogDish, bool) {
	key := NormalizeDishName(dishName)
	if key == "" {
		return CatalogDish{}, false
	}
	var best CatalogDish
	bestScore := 0
	for _, d := range DishCatalog() {
		for _, candidate := range []string{NormalizeDishName(d.Name), NormalizeDishName(d.DisplayLabel())} {
			if candidate == "" {
				continue
			}
			if candidate == key {
				return d, true
			}
			score := 0
			if strings.Contains(candidate, key) {
				score = len(key)
			} else if strings.Contains(key, candidate) {
				score = len(candidate)
			}
			if score > bestScore {
				best = d
				bestScore = score
			}
		}
	}
	if bestScore >= 4 {
		return best, true
	}
	return CatalogDish{}, false
}

type orderSuggestJSON struct {
	Items   []OrderSuggestItem `json:"items"`
	Summary string             `json:"summary"`
}

func parseOrderSuggestJSON(raw string) (orderSuggestJSON, error) {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)

	var out orderSuggestJSON
	if err := json.Unmarshal([]byte(cleaned), &out); err == nil {
		return out, nil
	}
	start := strings.Index(cleaned, "{")
	end := strings.LastIndex(cleaned, "}")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &out); err == nil {
			return out, nil
		}
	}
	return out, fmt.Errorf("invalid order suggest JSON")
}
