package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/units"
)

type shoppingListPage struct {
	Items   []ShoppingItem `json:"items"`
	Total   int            `json:"total"`
	Offset  int            `json:"offset"`
	Limit   int            `json:"limit"`
	HasMore bool           `json:"has_more"`
	Count   int            `json:"count"`
}

func listShoppingPage(ctx context.Context, db *sql.DB, kitchenID, q string, offset, limit int) (shoppingListPage, error) {
	var page shoppingListPage
	page.Offset = offset
	page.Limit = limit
	page.Items = []ShoppingItem{}

	where := "kitchen_id = $1 AND bought = FALSE"
	args := []interface{}{kitchenID}
	if strings.TrimSpace(q) != "" {
		where += " AND name ILIKE '%' || $2 || '%'"
		args = append(args, strings.TrimSpace(q))
	}

	countQuery := "SELECT COUNT(*) FROM shopping_items WHERE " + where
	if err := db.QueryRowContext(ctx, countQuery, args...).Scan(&page.Total); err != nil {
		return page, err
	}
	page.HasMore = offset+limit < page.Total
	page.Count = page.Total

	limitArg := len(args) + 1
	offsetArg := len(args) + 2
	listQuery := fmt.Sprintf(`
		SELECT id, name, qty, unit, ingredient_id, bought, created_at, bought_at
		FROM shopping_items
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, limitArg, offsetArg)
	listArgs := append(append([]interface{}{}, args...), limit, offset)
	rows, err := db.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	items := make([]ShoppingItem, 0, limit)
	for rows.Next() {
		var item ShoppingItem
		var ingredientID sql.NullString
		if err := rows.Scan(&item.ID, &item.Name, &item.Qty, &item.Unit, &ingredientID, &item.Bought, &item.CreatedAt, &item.BoughtAt); err != nil {
			continue
		}
		item.Unit = units.Normalize(item.Unit)
		if ingredientID.Valid {
			item.IngredientID = ingredientID.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	enrichShoppingItems(items)
	page.Items = items
	return page, nil
}
