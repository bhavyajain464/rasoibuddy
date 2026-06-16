package catalogdb

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"github.com/lib/pq"
)

// IngredientRow is one catalog ingredient for API pickers.
type IngredientRow struct {
	IngredientID string
	Name         string
	DefaultUnit  string
	Units        []string
	FoodGroup    string
}

// ListIngredients returns all verified ingredients sorted by name.
func ListIngredients(ctx context.Context, conn *sql.DB) ([]IngredientRow, error) {
	if conn == nil {
		return nil, fmt.Errorf("catalogdb: no database connection")
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT id, canonical_name, default_unit, units,
			COALESCE(metadata->>'food_group', 'other')
		FROM ingredients
		WHERE verified = true
		ORDER BY LOWER(canonical_name)
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []IngredientRow
	for rows.Next() {
		var r IngredientRow
		if err := rows.Scan(&r.IngredientID, &r.Name, &r.DefaultUnit, pq.Array(&r.Units), &r.FoodGroup); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SearchIngredients finds ingredients by pg_trgm similarity on aliases.
func SearchIngredients(ctx context.Context, conn *sql.DB, query string) ([]IngredientRow, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return ListIngredients(ctx, conn)
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT i.id, i.canonical_name, i.default_unit, i.units,
			COALESCE(i.metadata->>'food_group', 'other'),
			MAX(similarity(ia.normalized, lower(unaccent(trim($1))))) AS s
		FROM ingredients i
		JOIN ingredient_aliases ia ON ia.ingredient_id = i.id
		WHERE i.verified = true
		  AND (
		    ia.normalized % lower(unaccent(trim($1)))
		    OR similarity(ia.normalized, lower(unaccent(trim($1)))) > $2
		    OR LOWER(i.canonical_name) LIKE '%' || LOWER($1) || '%'
		  )
		GROUP BY i.id, i.canonical_name, i.default_unit, i.units, i.metadata
		ORDER BY s DESC NULLS LAST, LOWER(i.canonical_name)
		LIMIT 200
	`, query, FuzzySimilarityThreshold)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []IngredientRow
	for rows.Next() {
		var r IngredientRow
		var score float64
		if err := rows.Scan(&r.IngredientID, &r.Name, &r.DefaultUnit, pq.Array(&r.Units), &r.FoodGroup, &score); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	if len(out) == 0 {
		return out, nil
	}
	sort.SliceStable(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, rows.Err()
}
