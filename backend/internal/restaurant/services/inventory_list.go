package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const lowStockThreshold = 1

type InventoryListRow struct {
	ItemID        string  `json:"item_id"`
	CanonicalName string  `json:"canonical_name"`
	Qty           float64 `json:"qty"`
	Unit          string  `json:"unit"`
	FoodGroup     string  `json:"food_group"`
}

type InventoryListPage struct {
	Items           []InventoryListRow `json:"items"`
	NextCursor      string             `json:"next_cursor,omitempty"`
	HasMore         bool               `json:"has_more"`
	TotalCount      int                `json:"total_count"`
	LowStockCount   int                `json:"low_stock_count"`
	FoodGroupCounts map[string]int     `json:"food_group_counts"`
}

type ListInventoryParams struct {
	Limit     int
	Cursor    string
	FoodGroup string
	LowOnly   bool
}

func normalizeInventoryFoodGroup(group string) string {
	raw := strings.TrimSpace(strings.ToLower(group))
	if raw == "" {
		return "other"
	}
	if raw == "protein" {
		return "non_veg"
	}
	return raw
}

func inventoryFromClause() string {
	return `FROM inventory i
		LEFT JOIN restaurant_ingredients ri ON ri.name_normalized = LOWER(TRIM(i.canonical_name))`
}

func inventoryResolvedGroupExpr() string {
	return `CASE WHEN LOWER(COALESCE(NULLIF(TRIM(ri.food_group), ''), NULLIF(TRIM(i.food_group), ''), 'other')) = 'protein'
		THEN 'non_veg'
		ELSE LOWER(COALESCE(NULLIF(TRIM(ri.food_group), ''), NULLIF(TRIM(i.food_group), ''), 'other'))
	END`
}

func inventoryGroupExpr(alias string) string {
	_ = alias
	return inventoryResolvedGroupExpr()
}

func ListInventoryPage(ctx context.Context, db *sql.DB, kitchenID string, in ListInventoryParams) (InventoryListPage, error) {
	limit := in.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	groupCounts, total, lowCount, err := loadInventoryGroupCounts(ctx, db, kitchenID)
	if err != nil {
		return InventoryListPage{}, err
	}

	cursorGroup, cursorName, cursorID, err := decodeInventoryCursor(in.Cursor)
	if err != nil {
		return InventoryListPage{}, fmt.Errorf("invalid cursor")
	}

	args := []any{kitchenID}
	where := "WHERE i.kitchen_id = $1"
	argN := 2

	if in.LowOnly {
		where += fmt.Sprintf(" AND i.qty <= $%d", argN)
		args = append(args, lowStockThreshold)
		argN++
	}

	groupFilter := strings.TrimSpace(in.FoodGroup)
	if groupFilter != "" && groupFilter != "all" && groupFilter != "low" {
		where += fmt.Sprintf(" AND %s = $%d", inventoryGroupExpr("i"), argN)
		args = append(args, normalizeInventoryFoodGroup(groupFilter))
		argN++
	}

	if cursorID != "" {
		if cursorGroup != "" {
			where += fmt.Sprintf(" AND (%s, LOWER(i.canonical_name), i.item_id) > ($%d, $%d, $%d::uuid)", inventoryResolvedGroupExpr(), argN, argN+1, argN+2)
			args = append(args, cursorGroup, cursorName, cursorID)
			argN += 3
		} else {
			where += fmt.Sprintf(" AND (LOWER(i.canonical_name), i.item_id) > ($%d, $%d::uuid)", argN, argN+1)
			args = append(args, cursorName, cursorID)
			argN += 2
		}
	}

	query := fmt.Sprintf(`
		SELECT i.item_id::text, i.canonical_name, i.qty, i.unit,
			COALESCE(NULLIF(TRIM(ri.food_group), ''), NULLIF(TRIM(i.food_group), ''), 'other')
		%s
		%s
		ORDER BY %s, LOWER(i.canonical_name), i.item_id
		LIMIT $%d
	`, inventoryFromClause(), where, inventoryResolvedGroupExpr(), argN)
	args = append(args, limit+1)

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return InventoryListPage{}, err
	}
	defer rows.Close()

	out := make([]InventoryListRow, 0, limit)
	for rows.Next() {
		var row InventoryListRow
		if err := rows.Scan(&row.ItemID, &row.CanonicalName, &row.Qty, &row.Unit, &row.FoodGroup); err != nil {
			return InventoryListPage{}, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return InventoryListPage{}, err
	}

	for i := range out {
		out[i].FoodGroup = normalizeInventoryFoodGroup(out[i].FoodGroup)
	}

	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
	}

	page := InventoryListPage{
		Items:           out,
		HasMore:         hasMore,
		TotalCount:      total,
		LowStockCount:   lowCount,
		FoodGroupCounts: groupCounts,
	}
	if hasMore && len(out) > 0 {
		last := out[len(out)-1]
		page.NextCursor = encodeInventoryCursor(last.FoodGroup, last.CanonicalName, last.ItemID)
	}
	return page, nil
}

func encodeInventoryCursor(group, name, itemID string) string {
	return normalizeInventoryFoodGroup(group) + "|" + strings.ToLower(strings.TrimSpace(name)) + "|" + itemID
}

func decodeInventoryCursor(cursor string) (group, name, itemID string, err error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return "", "", "", nil
	}
	parts := strings.SplitN(cursor, "|", 3)
	if len(parts) == 2 {
		if parts[1] == "" {
			return "", "", "", fmt.Errorf("bad cursor")
		}
		return "", parts[0], parts[1], nil
	}
	if len(parts) != 3 || parts[2] == "" {
		return "", "", "", fmt.Errorf("bad cursor")
	}
	return parts[0], parts[1], parts[2], nil
}

func loadInventoryGroupCounts(ctx context.Context, db *sql.DB, kitchenID string) (map[string]int, int, int, error) {
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT %s, COUNT(*)
		%s
		WHERE i.kitchen_id = $1
		GROUP BY 1
	`, inventoryResolvedGroupExpr(), inventoryFromClause()), kitchenID)
	if err != nil {
		return nil, 0, 0, err
	}
	defer rows.Close()

	counts := map[string]int{}
	total := 0
	for rows.Next() {
		var grp string
		var n int
		if err := rows.Scan(&grp, &n); err != nil {
			return nil, 0, 0, err
		}
		if grp == "" {
			grp = "other"
		}
		counts[grp] = n
		total += n
	}
	if err := rows.Err(); err != nil {
		return nil, 0, 0, err
	}

	var lowCount int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM inventory WHERE kitchen_id = $1 AND qty <= $2
	`, kitchenID, lowStockThreshold).Scan(&lowCount); err != nil {
		return nil, 0, 0, err
	}
	return counts, total, lowCount, nil
}
