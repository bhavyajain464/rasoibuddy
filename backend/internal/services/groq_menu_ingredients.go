package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/config"
)

const (
	groqMaxTokensMenuIngredients = 4096
	menuDishIngredientsBatchSize   = 20
)

const menuDishIngredientsSystemPrompt = `You list raw kitchen ingredients for Indian restaurant dishes.
Output a JSON array only: [{"name":"<exact dish name from input>","ingredients":["ingredient1","ingredient2"]}]
Rules:
- Use the exact dish name from the input list.
- 4-12 simple lowercase ingredient names per dish (no quantities, no prep steps).
- Typical restaurant pantry items (dal, paneer, spices, vegetables, oil, etc.).
- Default vegetarian unless the dish name clearly includes egg/chicken/mutton/fish.`

// MenuDishIngredientInput is one menu row sent to Groq for BOM inference.
type MenuDishIngredientInput struct {
	Name     string `json:"name"`
	Category string `json:"category,omitempty"`
}

// MenuDishIngredientRow is one Groq response row.
type MenuDishIngredientRow struct {
	Name        string   `json:"name"`
	Ingredients []string `json:"ingredients"`
}

// GroqMenuDishIngredients asks Groq for ingredient lists keyed by normalized dish name.
func GroqMenuDishIngredients(ctx context.Context, cfg *config.Config, dishes []MenuDishIngredientInput) (map[string][]string, error) {
	if cfg == nil || !cfg.HasGroqAPIKey() {
		return nil, fmt.Errorf("groq API key not configured")
	}
	if len(dishes) == 0 {
		return map[string][]string{}, nil
	}

	out := make(map[string][]string, len(dishes))
	for start := 0; start < len(dishes); start += menuDishIngredientsBatchSize {
		end := start + menuDishIngredientsBatchSize
		if end > len(dishes) {
			end = len(dishes)
		}
		batch := dishes[start:end]
		rows, err := groqMenuDishIngredientsBatch(ctx, cfg, batch)
		if err != nil {
			return out, err
		}
		for _, row := range rows {
			name := strings.TrimSpace(row.Name)
			if name == "" || len(row.Ingredients) == 0 {
				continue
			}
			ings := cleanIngredientNames(row.Ingredients)
			if len(ings) == 0 {
				continue
			}
			out[normalizeMenuDishName(name)] = ings
		}
	}
	return out, nil
}

// NormalizeMenuDishName lowercases and collapses punctuation for dish name lookup keys.
func NormalizeMenuDishName(name string) string {
	return normalizeMenuDishName(name)
}

func groqMenuDishIngredientsBatch(ctx context.Context, cfg *config.Config, dishes []MenuDishIngredientInput) ([]MenuDishIngredientRow, error) {
	lines := make([]string, 0, len(dishes))
	for _, d := range dishes {
		name := strings.TrimSpace(d.Name)
		if name == "" {
			continue
		}
		category := strings.TrimSpace(d.Category)
		if category != "" {
			lines = append(lines, fmt.Sprintf("- %s (%s)", name, category))
		} else {
			lines = append(lines, "- "+name)
		}
	}
	if len(lines) == 0 {
		return nil, nil
	}

	maxOut := groqMaxTokensMenuIngredients
	if n := len(lines) * 80; n > maxOut {
		maxOut = n
	}
	if maxOut > 8192 {
		maxOut = 8192
	}

	prompt := "List ingredients for each dish:\n" + strings.Join(lines, "\n")
	text, err := groqChatWithSampling(ctx, cfg.PickGroqAPIKey(), cfg.EffectiveGroqModel(), 0.2, nil, nil, maxOut, []groqMessage{
		{Role: "system", Content: menuDishIngredientsSystemPrompt},
		{Role: "user", Content: prompt},
	}, false)
	if err != nil {
		return nil, fmt.Errorf("groq menu ingredients: %w", err)
	}
	return parseMenuDishIngredientsJSON(text)
}

func normalizeMenuDishName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	repl := strings.NewReplacer(",", " ", "/", " ", "-", " ", "(", " ", ")", " ", "'", " ")
	name = repl.Replace(name)
	return strings.Join(strings.Fields(name), " ")
}

func cleanIngredientNames(raw []string) []string {
	out := make([]string, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, ing := range raw {
		name := strings.TrimSpace(strings.ToLower(ing))
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

func parseMenuDishIngredientsJSON(responseText string) ([]MenuDishIngredientRow, error) {
	cleaned := strings.TrimSpace(responseText)
	if strings.HasPrefix(cleaned, "```json") {
		cleaned = strings.TrimPrefix(cleaned, "```json")
	}
	if strings.HasPrefix(cleaned, "```") {
		cleaned = strings.TrimPrefix(cleaned, "```")
	}
	if strings.HasSuffix(cleaned, "```") {
		cleaned = strings.TrimSuffix(cleaned, "```")
	}
	cleaned = strings.TrimSpace(cleaned)

	var rows []MenuDishIngredientRow
	if err := json.Unmarshal([]byte(cleaned), &rows); err == nil {
		return rows, nil
	}
	if start, end := strings.Index(cleaned, "["), strings.LastIndex(cleaned, "]"); start != -1 && end > start {
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &rows); err == nil {
			return rows, nil
		}
	}
	preview := cleaned
	if len(preview) > 240 {
		preview = preview[:240] + "…"
	}
	return nil, fmt.Errorf("failed to parse menu ingredients response: raw=%q", preview)
}
