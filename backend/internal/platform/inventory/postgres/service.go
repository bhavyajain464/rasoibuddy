package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/internal/dblock"
	"kitchenai-backend/pkg/contracts"
	"kitchenai-backend/pkg/units"
)

// Service implements contracts.InventoryService against Postgres.
type Service struct {
	db *sql.DB
}

func New(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) ListByKitchen(ctx context.Context, kitchenID string) ([]contracts.InventoryItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT item_id::text, kitchen_id::text, canonical_name, qty, unit,
		       COALESCE(food_group, 'other'), estimated_expiry, is_manual, created_at, updated_at
		FROM inventory
		WHERE kitchen_id = $1
		ORDER BY canonical_name
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]contracts.InventoryItem, 0)
	for rows.Next() {
		item, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) FindByName(ctx context.Context, kitchenID, name string) (*contracts.InventoryItem, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, nil
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT item_id::text, kitchen_id::text, canonical_name, qty, unit,
		       COALESCE(food_group, 'other'), estimated_expiry, is_manual, created_at, updated_at
		FROM inventory
		WHERE kitchen_id = $1 AND LOWER(canonical_name) = LOWER($2)
		LIMIT 1
	`, kitchenID, name)
	item, err := scanItemRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Service) AdjustQty(ctx context.Context, in contracts.AdjustQtyInput) (*contracts.InventoryMovement, error) {
	if in.KitchenID == "" || in.ItemID == "" || in.ActorUserID == "" {
		return nil, fmt.Errorf("kitchen_id, item_id, and actor_user_id required")
	}
	if in.DeltaQty == 0 {
		return nil, fmt.Errorf("delta_qty must be non-zero")
	}
	if strings.TrimSpace(in.Reason) == "" {
		return nil, fmt.Errorf("reason required")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if err := dblock.LockInventoryItem(tx, in.ItemID, in.KitchenID); err != nil {
		return nil, err
	}

	var currentQty float64
	err = tx.QueryRowContext(ctx, `
		SELECT qty FROM inventory WHERE item_id = $1 AND kitchen_id = $2
	`, in.ItemID, in.KitchenID).Scan(&currentQty)
	if err != nil {
		return nil, err
	}

	newQty := currentQty + in.DeltaQty
	if newQty < 0 {
		return nil, fmt.Errorf("insufficient stock: have %.4f, need %.4f", currentQty, -in.DeltaQty)
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE inventory SET qty = $1, updated_at = CURRENT_TIMESTAMP
		WHERE item_id = $2 AND kitchen_id = $3
	`, newQty, in.ItemID, in.KitchenID); err != nil {
		return nil, err
	}

	var movement contracts.InventoryMovement
	var orderID sql.NullString
	if in.OrderID != nil && *in.OrderID != "" {
		orderID = sql.NullString{String: *in.OrderID, Valid: true}
	}
	err = tx.QueryRowContext(ctx, `
		INSERT INTO inventory_movements (kitchen_id, item_id, actor_user_id, order_id, delta_qty, reason)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING movement_id::text, kitchen_id::text, item_id::text, actor_user_id::text,
		          order_id::text, delta_qty, reason, created_at
	`, in.KitchenID, in.ItemID, in.ActorUserID, orderID, in.DeltaQty, in.Reason).Scan(
		&movement.MovementID,
		&movement.KitchenID,
		&movement.ItemID,
		&movement.ActorUserID,
		&orderID,
		&movement.DeltaQty,
		&movement.Reason,
		&movement.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if orderID.Valid {
		oid := orderID.String
		movement.OrderID = &oid
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &movement, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanItem(rows *sql.Rows) (contracts.InventoryItem, error) {
	return scanItemRow(rows)
}

func scanItemRow(row rowScanner) (contracts.InventoryItem, error) {
	var item contracts.InventoryItem
	var expiry sql.NullTime
	err := row.Scan(
		&item.ItemID,
		&item.KitchenID,
		&item.CanonicalName,
		&item.Qty,
		&item.Unit,
		&item.FoodGroup,
		&expiry,
		&item.IsManual,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return item, err
	}
	item.Unit = units.Normalize(item.Unit)
	if expiry.Valid {
		t := expiry.Time
		item.EstimatedExpiry = &t
	}
	return item, nil
}
