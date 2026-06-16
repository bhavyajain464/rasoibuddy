package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/internal/services/catalogdb"
	"kitchenai-backend/internal/services/ingredients"
)

func main() {
	fix := flag.Bool("fix", false, "rewrite dishes/catalog.json with normalized pairs_with ids")
	flag.Parse()

	ingJSON := ingredients.CatalogJSON()
	dishJSON := services.DishCatalogJSON()

	audit, err := catalogdb.AuditPairsWith(dishJSON, ingJSON)
	if err != nil {
		fmt.Fprintf(os.Stderr, "audit failed: %v\n", err)
		os.Exit(1)
	}

	var resolved, unresolved []catalogdb.PairLabelAudit
	for _, a := range audit {
		if a.Resolved {
			resolved = append(resolved, a)
		} else {
			unresolved = append(unresolved, a)
		}
	}

	fmt.Printf("pairs_with audit: %d unique labels, %d resolved, %d unresolved\n\n",
		len(audit), len(resolved), len(unresolved))

	if len(unresolved) > 0 {
		fmt.Println("UNRESOLVED:")
		for _, a := range unresolved {
			fmt.Printf("  %q (used %d times)\n", a.Label, a.Count)
		}
		fmt.Println()
	}

	fmt.Println("RESOLVED (label → kind:id):")
	for _, a := range resolved {
		fmt.Printf("  %q → %s:%s (%d uses)\n", a.Label, a.Ref.Kind, a.Ref.ID, a.Count)
	}

	if *fix {
		if len(unresolved) > 0 {
			fmt.Fprintf(os.Stderr, "refusing to fix: %d unresolved labels remain\n", len(unresolved))
			os.Exit(1)
		}
		if err := fixCatalogPairs(dishJSON, ingJSON); err != nil {
			fmt.Fprintf(os.Stderr, "fix failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("\nUpdated dishes/catalog.json with normalized pairs_with ids")
	}

	if len(unresolved) > 0 {
		os.Exit(1)
	}
}

func fixCatalogPairs(dishJSON, ingJSON []byte) error {
	r, err := catalogdb.NewPairCatalogResolver(ingJSON, dishJSON, nil)
	if err != nil {
		return err
	}
	var dishes []map[string]any
	if err := json.Unmarshal(dishJSON, &dishes); err != nil {
		return err
	}
	for i := range dishes {
		raw, ok := dishes[i]["pairs_with"].([]any)
		if !ok || len(raw) == 0 {
			continue
		}
		seen := map[string]bool{}
		normalized := make([]string, 0, len(raw))
		for _, item := range raw {
			label, _ := item.(string)
			label = strings.TrimSpace(label)
			if label == "" {
				continue
			}
			ref, ok := r.ResolvePairLabel(label)
			if !ok {
				return fmt.Errorf("dish %v: unresolved pairs_with %q", dishes[i]["id"], label)
			}
			id := ref.ID
			if seen[id] {
				continue
			}
			seen[id] = true
			normalized = append(normalized, id)
		}
		dishes[i]["pairs_with"] = normalized
	}
	out, err := json.MarshalIndent(dishes, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	path := "internal/services/dishes/catalog.json"
	return os.WriteFile(path, out, 0644)
}
