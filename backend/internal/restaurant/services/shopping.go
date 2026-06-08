package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"kitchenai-backend/pkg/units"
)

type ShoppingItem struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Qty       float64    `json:"qty"`
	Unit      string     `json:"unit"`
	FoodGroup string     `json:"food_group"`
	Bought    bool       `json:"bought"`
	CreatedAt time.Time  `json:"created_at"`
	BoughtAt  *time.Time `json:"bought_at,omitempty"`
}

type ShoppingService struct {
	db *sql.DB
}

func NewShoppingService(db *sql.DB) *ShoppingService {
	return &ShoppingService{db: db}
}

func (s *ShoppingService) List(ctx context.Context, kitchenID string) ([]ShoppingItem, error) {
	query := fmt.Sprintf(`
		SELECT si.id::text, si.name, si.qty, si.unit, si.bought, si.created_at, si.bought_at,
			%s
		%s
		WHERE si.kitchen_id = $1 AND si.bought = FALSE
		ORDER BY %s, LOWER(si.name), si.created_at DESC
	`, catalogJoinFoodGroupSelect(), catalogJoinFrom(), catalogJoinFoodGroupSortExpr())

	rows, err := s.db.QueryContext(ctx, query, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]ShoppingItem, 0)
	for rows.Next() {
		var item ShoppingItem
		var rawGroup string
		if err := rows.Scan(&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt, &item.BoughtAt, &rawGroup); err != nil {
			return nil, err
		}
		item.Unit = units.Normalize(item.Unit)
		item.FoodGroup = resolveShoppingFoodGroup(rawGroup, item.Name)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *ShoppingService) Add(ctx context.Context, kitchenID, userID, name string, qty float64, unit string) (*ShoppingItem, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	if qty < 0 {
		qty = 0
	}

	var catalogName, catalogUnit, catalogFoodGroup string
	err := s.db.QueryRowContext(ctx, `
		SELECT name, default_unit, COALESCE(NULLIF(TRIM(food_group), ''), 'other')
		FROM restaurant_ingredients WHERE name_normalized = $1
	`, normalizeIngredientName(name)).Scan(&catalogName, &catalogUnit, &catalogFoodGroup)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("ingredient not in catalog")
	}
	if err != nil {
		return nil, err
	}
	name = catalogName
	foodGroup := normalizeInventoryFoodGroup(catalogFoodGroup)

	unit = units.Normalize(strings.TrimSpace(unit))
	if unit == "" {
		unit = units.Normalize(catalogUnit)
	}
	if unit == "" {
		unit = "pcs"
	}

	var item ShoppingItem
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO shopping_items (user_id, kitchen_id, name, qty, unit)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id::text, name, qty, unit, bought, created_at
	`, userID, kitchenID, name, qty, unit).Scan(
		&item.ID, &item.Name, &item.Qty, &item.Unit, &item.Bought, &item.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	item.FoodGroup = foodGroup
	return &item, nil
}

func (s *ShoppingService) Delete(ctx context.Context, kitchenID, itemID string) error {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM shopping_items WHERE id = $1 AND kitchen_id = $2
	`, itemID, kitchenID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("item not found")
	}
	return nil
}
