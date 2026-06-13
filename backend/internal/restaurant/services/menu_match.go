package services

import (
	"regexp"
	"strings"
)

var (
	orderNameNoiseRe = regexp.MustCompile(`[^a-z0-9\s]+`)
	orderNameSpaceRe = regexp.MustCompile(`\s+`)
)

func normalizeMenuMatchName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.ToLower(name)
	name = orderNameNoiseRe.ReplaceAllString(name, " ")
	name = orderNameSpaceRe.ReplaceAllString(name, " ")
	return strings.TrimSpace(name)
}

// MatchMenuItemByName finds the best menu item for an aggregator/POS line name.
func MatchMenuItemByName(items []MenuItem, name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	norm := normalizeMenuMatchName(name)
	if norm == "" {
		return ""
	}

	exact := map[string]string{}
	for _, m := range items {
		if !m.IsActive {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(m.Name), name) {
			return m.MenuItemID
		}
		key := normalizeMenuMatchName(m.Name)
		if key != "" {
			exact[key] = m.MenuItemID
		}
	}
	if id, ok := exact[norm]; ok {
		return id
	}

	var bestID string
	bestScore := 0
	for _, m := range items {
		if !m.IsActive {
			continue
		}
		mn := normalizeMenuMatchName(m.Name)
		if mn == "" {
			continue
		}
		score := 0
		switch {
		case mn == norm:
			score = 100
		case strings.Contains(mn, norm) || strings.Contains(norm, mn):
			score = 60 + min(len(mn), len(norm))
		default:
			nt := strings.Fields(norm)
			mt := strings.Fields(mn)
			overlap := 0
			for _, a := range nt {
				for _, b := range mt {
					if a == b && len(a) > 2 {
						overlap++
					}
				}
			}
			if overlap >= 2 {
				score = 40 + overlap*5
			}
		}
		if score > bestScore {
			bestScore = score
			bestID = m.MenuItemID
		}
	}
	if bestScore >= 40 {
		return bestID
	}
	return ""
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
