package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}

	catalog := services.DishCatalogJSON()
	var dishes []map[string]any
	if err := json.Unmarshal(catalog, &dishes); err != nil {
		fmt.Fprintf(os.Stderr, "parse catalog: %v\n", err)
		os.Exit(1)
	}

	type member struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		VariantStyle string `json:"variant_style,omitempty"`
	}

	families := map[string][]member{}
	for _, d := range dishes {
		id, _ := d["id"].(string)
		fam, _ := d["dish_family"].(string)
		if strings.TrimSpace(fam) == "" {
			fam = id
		}
		name, _ := d["name"].(string)
		if dn, ok := d["display_name"].(string); ok && strings.TrimSpace(dn) != "" {
			name = dn
		}
		m := member{ID: id, Name: name}
		if vs, ok := d["variant_style"].(string); ok {
			m.VariantStyle = vs
		}
		families[fam] = append(families[fam], m)
	}

	multi := map[string][]member{}
	solo := 0
	for fam, members := range families {
		if len(members) > 1 {
			sort.Slice(members, func(i, j int) bool { return members[i].ID < members[j].ID })
			multi[fam] = members
		} else {
			solo++
		}
	}

	payload, _ := json.MarshalIndent(multi, "", "  ")
	prompt := fmt.Sprintf(`You are reviewing dish_family groupings for an Indian home-cooking meal planner app.

Goal of dish_family: dishes in the SAME family should be "the same slot" in a weekly plan — interchangeable variants that differ mainly by lentil type, stuffing, or minor prep. Only ONE dish per family should appear per week.

variant_style: sub-group within a family. Variants with DIFFERENT variant_style are NOT interchangeable (e.g. dal tadka vs dal fry).

Context:
- Total catalog dishes: %d
- Families with 2+ members: %d (listed below)
- Dishes with unique self-family: %d

ASSIGNED FAMILIES (only multi-member ones):
%s

Please review and respond in this structure:

## Overall verdict
(correct / mostly correct / needs significant rework — 2-3 sentences)

## Correct families
(list family names that are well grouped)

## Problems — wrong members
For each issue: family name, dish id(s), why wrong, suggested fix

## Problems — variant_style
Any dishes where variant_style is wrong or missing within a family

## Missing groupings
Dishes currently in self-family that SHOULD share a family (name ids)

## Weekly plan impact
Will these families fix "too many dals in one week"? Any family still too broad?

Be specific. Reference dish ids.`, len(dishes), len(multi), solo, string(payload))

	ctx := context.Background()
	text, err := services.GroqChatText(ctx, cfg.PickGroqAPIKey(), cfg.EffectiveGroqModel(), 0.2, prompt)
	if err != nil {
		fmt.Fprintf(os.Stderr, "groq error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(text)
}
