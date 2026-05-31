package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"

	invgroup "kitchenai-backend/internal/services/inventory"
	"kitchenai-backend/pkg/config"

	"github.com/google/generative-ai-go/genai"
)

// InventoryEnrichment is shelf-life + pantry category from the configured LLM.
type InventoryEnrichment struct {
	Name          string `json:"name"`
	ShelfLifeDays int    `json:"shelf_life_days"`
	FoodGroup     string `json:"food_group"`
}

var enrichObjectPattern = regexp.MustCompile(`\{[^{}]*"name"\s*:\s*"[^"]+"[^{}]*"shelf_life_days"\s*:\s*-?\d+[^{}]*"food_group"\s*:\s*"[^"]+"[^{}]*\}`)

// EnrichInventoryItemsForConfig estimates shelf life and food_group via the configured LLM.
func EnrichInventoryItemsForConfig(ctx context.Context, cfg *config.Config, itemNames []string, dietaryTags []string) ([]InventoryEnrichment, error) {
	if len(itemNames) == 0 {
		return nil, nil
	}
	switch cfg.LLMProvider {
	case "gemini":
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty")
		}
		g, err := NewGeminiService(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			return nil, err
		}
		defer g.Close()
		return g.EnrichInventoryItems(itemNames, dietaryTags)
	default:
		if !cfg.HasGroqAPIKey() {
			return nil, fmt.Errorf("LLM_PROVIDER=groq but GROQ_API_KEY is empty")
		}
		return EnrichInventoryItemsGroq(ctx, cfg, itemNames, dietaryTags)
	}
}

func enrichmentPrompt(itemNames []string, dietaryTags []string) string {
	extra := ""
	if invgroup.HidesNonVegGroup(dietaryTags) {
		extra = "\nUser is vegetarian/vegan: do not use non_veg; classify meat/fish/eggs as other or dairy as appropriate.\n"
	}
	return fmt.Sprintf(`For each Indian home pantry item below, return shelf_life_days (integer) and food_group.

Allowed food_group values (use exactly one): %s
%s
Items: %s

Return ONLY a JSON array, no markdown:
[{"name":"item name","shelf_life_days":30,"food_group":"vegetables"}]`,
		invgroup.PromptGroupListForDietary(dietaryTags),
		extra,
		strings.Join(itemNames, ", "))
}

// EnrichInventoryItemsGroq classifies items and estimates shelf life via Groq.
func EnrichInventoryItemsGroq(ctx context.Context, cfg *config.Config, itemNames []string, dietaryTags []string) ([]InventoryEnrichment, error) {
	if !cfg.HasGroqAPIKey() {
		return nil, fmt.Errorf("groq API key not configured")
	}
	maxOut := groqMaxTokensShelfLife
	if n := len(itemNames) * 48; n > maxOut {
		maxOut = n
	}
	if maxOut > 4096 {
		maxOut = 4096
	}
	text, err := groqChat(ctx, cfg.PickGroqAPIKey(), cfg.EffectiveGroqModel(), 0.1, maxOut, []groqMessage{
		{Role: "user", Content: enrichmentPrompt(itemNames, dietaryTags)},
	})
	if err != nil {
		return nil, fmt.Errorf("groq inventory enrich: %w", err)
	}
	return parseInventoryEnrichmentJSON(text, dietaryTags)
}

// EnrichInventoryItems asks Gemini for shelf life and food_group.
func (s *GeminiService) EnrichInventoryItems(itemNames []string, dietaryTags []string) ([]InventoryEnrichment, error) {
	ctx := context.Background()
	model := s.client.GenerativeModel(s.model)
	model.SetTemperature(0.1)

	resp, err := model.GenerateContent(ctx, genai.Text(enrichmentPrompt(itemNames, dietaryTags)))
	if err != nil {
		return nil, fmt.Errorf("gemini enrich: %w", err)
	}
	if resp.Candidates == nil || len(resp.Candidates) == 0 {
		return nil, fmt.Errorf("no response from Gemini")
	}

	var responseText string
	for _, part := range resp.Candidates[0].Content.Parts {
		if text, ok := part.(genai.Text); ok {
			responseText = string(text)
			break
		}
	}
	return parseInventoryEnrichmentJSON(responseText, dietaryTags)
}

func parseInventoryEnrichmentJSON(responseText string, dietaryTags []string) ([]InventoryEnrichment, error) {
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

	normalize := func(items []InventoryEnrichment) []InventoryEnrichment {
		for i := range items {
			items[i].FoodGroup = invgroup.NormalizeFoodGroupForDietary(items[i].FoodGroup, dietaryTags)
		}
		return items
	}

	var out []InventoryEnrichment
	if err := json.Unmarshal([]byte(cleaned), &out); err == nil && len(out) > 0 {
		return normalize(out), nil
	}
	if start, end := strings.Index(cleaned, "["), strings.LastIndex(cleaned, "]"); start != -1 && end > start {
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &out); err == nil && len(out) > 0 {
			return normalize(out), nil
		}
	}

	salvaged := salvageEnrichmentObjects(cleaned)
	if len(salvaged) > 0 {
		log.Printf("[inventory-enrich] partial parse: recovered %d object(s)", len(salvaged))
		return normalize(salvaged), nil
	}

	preview := cleaned
	if len(preview) > 240 {
		preview = preview[:240] + "…"
	}
	return nil, fmt.Errorf("failed to parse inventory enrich response: raw=%q", preview)
}

func salvageEnrichmentObjects(s string) []InventoryEnrichment {
	matches := enrichObjectPattern.FindAllString(s, -1)
	if len(matches) == 0 {
		return nil
	}
	out := make([]InventoryEnrichment, 0, len(matches))
	for _, m := range matches {
		var e InventoryEnrichment
		if err := json.Unmarshal([]byte(m), &e); err != nil {
			continue
		}
		if strings.TrimSpace(e.Name) == "" || e.ShelfLifeDays <= 0 {
			continue
		}
		out = append(out, e)
	}
	return out
}
