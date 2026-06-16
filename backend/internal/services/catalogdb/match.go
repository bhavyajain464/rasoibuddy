package catalogdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// DishIngredientMatch is inventory coverage for a dish via keyed ingredient ids.
type DishIngredientMatch struct {
	Have     []string
	Missing  []string
	Staples  []string
	Coverage float64
}

// MatchDishToInventory compares dish_ingredients against a set of inventory ingredient ids.
func MatchDishToInventory(ctx context.Context, conn *sql.DB, dishID string, haveIDs map[string]bool) (DishIngredientMatch, error) {
	var res DishIngredientMatch
	if conn == nil || dishID == "" {
		res.Coverage = 1.0
		return res, nil
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT di.ingredient_id, i.canonical_name, di.is_staple
		FROM dish_ingredients di
		JOIN ingredients i ON i.id = di.ingredient_id
		WHERE di.dish_id = $1
		ORDER BY di.sort_order
	`, dishID)
	if err != nil {
		return res, err
	}
	defer rows.Close()

	for rows.Next() {
		var ingID, name string
		var isStaple bool
		if err := rows.Scan(&ingID, &name, &isStaple); err != nil {
			return res, err
		}
		switch {
		case haveIDs[ingID]:
			res.Have = append(res.Have, name)
		case isStaple:
			res.Staples = append(res.Staples, name)
		default:
			res.Missing = append(res.Missing, name)
		}
	}
	denom := len(res.Have) + len(res.Missing)
	if denom > 0 {
		res.Coverage = float64(len(res.Have)) / float64(denom)
	} else {
		res.Coverage = 1.0
	}
	return res, rows.Err()
}

// DishIngredientRow is one recipe line for order-suggest matching.
type DishIngredientRow struct {
	IngredientID  string
	CanonicalName string
	IsStaple      bool
}

// LoadDishIngredientsByIDs loads recipe lines for many dishes in one query.
func LoadDishIngredientsByIDs(ctx context.Context, conn *sql.DB, dishIDs []string) (map[string][]DishIngredientRow, error) {
	out := map[string][]DishIngredientRow{}
	if conn == nil {
		return out, fmt.Errorf("catalogdb: no database connection")
	}
	uniq := make([]string, 0, len(dishIDs))
	seen := map[string]bool{}
	for _, id := range dishIDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return out, nil
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT di.dish_id, di.ingredient_id, i.canonical_name, di.is_staple
		FROM dish_ingredients di
		JOIN ingredients i ON i.id = di.ingredient_id
		WHERE di.dish_id = ANY($1)
		ORDER BY di.dish_id, di.sort_order
	`, pq.Array(uniq))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var dishID string
		var row DishIngredientRow
		if err := rows.Scan(&dishID, &row.IngredientID, &row.CanonicalName, &row.IsStaple); err != nil {
			return nil, err
		}
		out[dishID] = append(out[dishID], row)
	}
	return out, rows.Err()
}

func MatchDishIngredientRowsToInventory(rows []DishIngredientRow, haveIDs map[string]bool) DishIngredientMatch {
	var res DishIngredientMatch
	for _, row := range rows {
		switch {
		case haveIDs[row.IngredientID]:
			res.Have = append(res.Have, row.CanonicalName)
		case row.IsStaple:
			res.Staples = append(res.Staples, row.CanonicalName)
		default:
			res.Missing = append(res.Missing, row.CanonicalName)
		}
	}
	denom := len(res.Have) + len(res.Missing)
	if denom > 0 {
		res.Coverage = float64(len(res.Have)) / float64(denom)
	} else {
		res.Coverage = 1.0
	}
	return res
}
