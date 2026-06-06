package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/lib/pq"
	"kitchenai-backend/pkg/contracts"
)

type MenuService struct {
	db *sql.DB
}

func NewMenuService(db *sql.DB) *MenuService {
	return &MenuService{db: db}
}

func (s *MenuService) ListMenuItems(ctx context.Context, kitchenID string, activeOnly bool) ([]MenuItem, error) {
	q := `
		SELECT menu_item_id::text, kitchen_id::text, name, category, price_cents, is_active, created_at, updated_at
		FROM menu_items WHERE kitchen_id = $1`
	if activeOnly {
		q += ` AND is_active = TRUE`
	}
	q += ` ORDER BY category, name`

	rows, err := s.db.QueryContext(ctx, q, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]MenuItem, 0)
	for rows.Next() {
		var m MenuItem
		if err := rows.Scan(&m.MenuItemID, &m.KitchenID, &m.Name, &m.Category, &m.PriceCents, &m.IsActive, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func normalizeMenuCategory(category string) string {
	c := strings.TrimSpace(strings.ToLower(category))
	if c == "" {
		return "general"
	}
	return c
}

func (s *MenuService) ListMenuPage(ctx context.Context, kitchenID string, in ListMenuParams) (MenuListPage, error) {
	limit := in.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	counts, total, err := s.loadMenuCategoryCounts(ctx, kitchenID, in.ActiveOnly)
	if err != nil {
		return MenuListPage{}, err
	}

	cursorCat, cursorName, cursorID, err := decodeMenuCursor(in.Cursor)
	if err != nil {
		return MenuListPage{}, fmt.Errorf("invalid cursor")
	}

	args := []any{kitchenID}
	where := "WHERE m.kitchen_id = $1"
	argN := 2

	if in.ActiveOnly {
		where += " AND m.is_active = TRUE"
	}

	categoryFilter := strings.TrimSpace(in.Category)
	if categoryFilter != "" && categoryFilter != "all" {
		where += fmt.Sprintf(" AND LOWER(TRIM(m.category)) = $%d", argN)
		args = append(args, normalizeMenuCategory(categoryFilter))
		argN++
	}

	if cursorID != "" {
		where += fmt.Sprintf(
			" AND (LOWER(TRIM(m.category)), m.name, m.menu_item_id) > ($%d, $%d, $%d::uuid)",
			argN, argN+1, argN+2,
		)
		args = append(args, cursorCat, cursorName, cursorID)
		argN += 3
	}

	query := fmt.Sprintf(`
		SELECT m.menu_item_id::text, m.kitchen_id::text, m.name, m.category, m.price_cents, m.is_active, m.created_at, m.updated_at
		FROM menu_items m
		%s
		ORDER BY LOWER(TRIM(m.category)), m.name, m.menu_item_id
		LIMIT $%d
	`, where, argN)
	args = append(args, limit+1)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return MenuListPage{}, err
	}
	defer rows.Close()

	out := make([]MenuItem, 0, limit)
	for rows.Next() {
		var m MenuItem
		if err := rows.Scan(&m.MenuItemID, &m.KitchenID, &m.Name, &m.Category, &m.PriceCents, &m.IsActive, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return MenuListPage{}, err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return MenuListPage{}, err
	}

	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
	}

	page := MenuListPage{
		Items:          out,
		HasMore:        hasMore,
		TotalCount:     total,
		CategoryCounts: counts,
	}
	if hasMore && len(out) > 0 {
		last := out[len(out)-1]
		page.NextCursor = encodeMenuCursor(last)
	}
	if in.IncludeIngredients && len(out) > 0 {
		ids := make([]string, len(out))
		for i, item := range out {
			ids[i] = item.MenuItemID
		}
		ingredientsByItem, err := s.loadRecipeIngredientsForMenuItems(ctx, kitchenID, ids)
		if err != nil {
			return MenuListPage{}, err
		}
		page.IngredientsByItem = ingredientsByItem
	}
	return page, nil
}

func (s *MenuService) loadRecipeIngredientsForMenuItems(ctx context.Context, kitchenID string, menuItemIDs []string) (map[string][]RecipeIngredient, error) {
	out := make(map[string][]RecipeIngredient, len(menuItemIDs))
	if len(menuItemIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.menu_item_id::text, ri.ingredient_id::text, ri.recipe_id::text, ri.ingredient_name, ri.qty, ri.unit,
		       ri.waste_factor, ri.inventory_item_id::text, ri.sort_order
		FROM recipe_ingredients ri
		JOIN recipes r ON r.recipe_id = ri.recipe_id
		WHERE r.kitchen_id = $1 AND r.menu_item_id = ANY($2::uuid[])
		ORDER BY r.menu_item_id, ri.sort_order, ri.ingredient_name
	`, kitchenID, pq.Array(menuItemIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var menuItemID string
		var ing RecipeIngredient
		var invID sql.NullString
		if err := rows.Scan(&menuItemID, &ing.IngredientID, &ing.RecipeID, &ing.IngredientName, &ing.Qty, &ing.Unit, &ing.WasteFactor, &invID, &ing.SortOrder); err != nil {
			return nil, err
		}
		if invID.Valid {
			ing.InventoryItemID = &invID.String
		}
		out[menuItemID] = append(out[menuItemID], ing)
	}
	return out, rows.Err()
}

func encodeMenuCursor(m MenuItem) string {
	return normalizeMenuCategory(m.Category) + "|" + m.Name + "|" + m.MenuItemID
}

func decodeMenuCursor(cursor string) (category, name, menuItemID string, err error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return "", "", "", nil
	}
	parts := strings.SplitN(cursor, "|", 3)
	if len(parts) != 3 || parts[2] == "" {
		return "", "", "", fmt.Errorf("bad cursor")
	}
	return parts[0], parts[1], parts[2], nil
}

func (s *MenuService) loadMenuCategoryCounts(ctx context.Context, kitchenID string, activeOnly bool) (map[string]int, int, error) {
	q := `
		SELECT LOWER(TRIM(category)), COUNT(*)
		FROM menu_items
		WHERE kitchen_id = $1`
	if activeOnly {
		q += ` AND is_active = TRUE`
	}
	q += ` GROUP BY LOWER(TRIM(category))`

	rows, err := s.db.QueryContext(ctx, q, kitchenID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	counts := map[string]int{}
	total := 0
	for rows.Next() {
		var cat string
		var n int
		if err := rows.Scan(&cat, &n); err != nil {
			return nil, 0, err
		}
		if cat == "" {
			cat = "general"
		}
		counts[cat] = n
		total += n
	}
	return counts, total, rows.Err()
}

func (s *MenuService) UpsertMenuItem(ctx context.Context, kitchenID string, item MenuItem) (*MenuItem, error) {
	name := strings.TrimSpace(item.Name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	category := strings.TrimSpace(item.Category)
	if category == "" {
		category = "general"
	}
	if item.PriceCents < 0 {
		return nil, fmt.Errorf("price_cents must be >= 0")
	}

	if item.MenuItemID != "" {
		var out MenuItem
		err := s.db.QueryRowContext(ctx, `
			UPDATE menu_items
			SET name = $3, category = $4, price_cents = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
			WHERE menu_item_id = $1 AND kitchen_id = $2
			RETURNING menu_item_id::text, kitchen_id::text, name, category, price_cents, is_active, created_at, updated_at
		`, item.MenuItemID, kitchenID, name, category, item.PriceCents, item.IsActive).Scan(
			&out.MenuItemID, &out.KitchenID, &out.Name, &out.Category, &out.PriceCents, &out.IsActive, &out.CreatedAt, &out.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("menu item not found")
		}
		if err != nil {
			return nil, err
		}
		return &out, nil
	}

	var out MenuItem
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO menu_items (kitchen_id, name, category, price_cents, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING menu_item_id::text, kitchen_id::text, name, category, price_cents, is_active, created_at, updated_at
	`, kitchenID, name, category, item.PriceCents, item.IsActive).Scan(
		&out.MenuItemID, &out.KitchenID, &out.Name, &out.Category, &out.PriceCents, &out.IsActive, &out.CreatedAt, &out.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO recipes (menu_item_id, kitchen_id) VALUES ($1, $2)
		ON CONFLICT (menu_item_id) DO NOTHING
	`, out.MenuItemID, kitchenID)
	return &out, nil
}

func (s *MenuService) GetRecipeIngredients(ctx context.Context, kitchenID, menuItemID string) ([]RecipeIngredient, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT ri.ingredient_id::text, ri.recipe_id::text, ri.ingredient_name, ri.qty, ri.unit,
		       ri.waste_factor, ri.inventory_item_id::text, ri.sort_order
		FROM recipe_ingredients ri
		JOIN recipes r ON r.recipe_id = ri.recipe_id
		WHERE r.menu_item_id = $1 AND r.kitchen_id = $2
		ORDER BY ri.sort_order, ri.ingredient_name
	`, menuItemID, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]RecipeIngredient, 0)
	for rows.Next() {
		var ing RecipeIngredient
		var invID sql.NullString
		if err := rows.Scan(&ing.IngredientID, &ing.RecipeID, &ing.IngredientName, &ing.Qty, &ing.Unit, &ing.WasteFactor, &invID, &ing.SortOrder); err != nil {
			return nil, err
		}
		if invID.Valid {
			ing.InventoryItemID = &invID.String
		}
		out = append(out, ing)
	}
	return out, rows.Err()
}

func (s *MenuService) SetRecipeIngredients(ctx context.Context, kitchenID, menuItemID string, ingredients []RecipeIngredient) ([]RecipeIngredient, error) {
	var recipeID string
	err := s.db.QueryRowContext(ctx, `
		SELECT recipe_id::text FROM recipes WHERE menu_item_id = $1 AND kitchen_id = $2
	`, menuItemID, kitchenID).Scan(&recipeID)
	if err == sql.ErrNoRows {
		err = s.db.QueryRowContext(ctx, `
			INSERT INTO recipes (menu_item_id, kitchen_id) VALUES ($1, $2)
			RETURNING recipe_id::text
		`, menuItemID, kitchenID).Scan(&recipeID)
	}
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_ingredients WHERE recipe_id = $1`, recipeID); err != nil {
		return nil, err
	}

	for i, ing := range ingredients {
		name := strings.TrimSpace(ing.IngredientName)
		if name == "" || ing.Qty <= 0 {
			continue
		}
		unit := strings.TrimSpace(ing.Unit)
		if unit == "" {
			unit = "pcs"
		}
		waste := ing.WasteFactor
		if waste <= 0 {
			waste = 1.0
		}
		sortOrder := ing.SortOrder
		if sortOrder == 0 {
			sortOrder = i + 1
		}
		var invID interface{}
		if ing.InventoryItemID != nil && *ing.InventoryItemID != "" {
			invID = *ing.InventoryItemID
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO recipe_ingredients (recipe_id, kitchen_id, ingredient_name, qty, unit, waste_factor, inventory_item_id, sort_order)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, recipeID, kitchenID, name, ing.Qty, unit, waste, invID, sortOrder); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetRecipeIngredients(ctx, kitchenID, menuItemID)
}

func EnsureRestaurantKitchen(ctx context.Context, kitchenSvc contracts.KitchenService, kitchenID string) error {
	k, err := kitchenSvc.GetKitchen(ctx, kitchenID)
	if err != nil {
		return err
	}
	if k == nil || k.Kind != contracts.KitchenKindRestaurant {
		return fmt.Errorf("not a restaurant kitchen")
	}
	return nil
}
