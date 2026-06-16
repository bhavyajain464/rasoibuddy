package services

import (
	"encoding/json"
	"strings"
)

// IngredientLine is a catalog-backed grocery line (stable id + display name).
type IngredientLine struct {
	IngredientID string `json:"ingredient_id"`
	Name         string `json:"name"`
}

// PairIngredientLinesMap maps pairs_with labels to catalog ingredient lines.
type PairIngredientLinesMap map[string][]IngredientLine

// UnmarshalJSON accepts legacy string slices and structured ingredient lines.
func (m *PairIngredientLinesMap) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	out := make(PairIngredientLinesMap, len(raw))
	for k, v := range raw {
		var lines []IngredientLine
		if err := json.Unmarshal(v, &lines); err == nil && len(lines) > 0 && strings.TrimSpace(lines[0].Name) != "" {
			out[k] = lines
			continue
		}
		var names []string
		if err := json.Unmarshal(v, &names); err != nil {
			return err
		}
		for _, n := range names {
			n = strings.TrimSpace(n)
			if n == "" {
				continue
			}
			out[k] = append(out[k], IngredientLine{Name: n})
		}
	}
	*m = out
	return nil
}

// IngredientLineNames returns display names from catalog lines.
func IngredientLineNames(lines []IngredientLine) []string {
	if len(lines) == 0 {
		return nil
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if n := strings.TrimSpace(line.Name); n != "" {
			out = append(out, n)
		}
	}
	return out
}

// IngredientLineIDs returns stable ingredient ids (skips empty ids).
func IngredientLineIDs(lines []IngredientLine) []string {
	if len(lines) == 0 {
		return nil
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if id := strings.TrimSpace(line.IngredientID); id != "" {
			out = append(out, id)
		}
	}
	return out
}
