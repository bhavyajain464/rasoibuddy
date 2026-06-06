package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"kitchenai-backend/pkg/contracts"

	"github.com/lib/pq"
)

type OrderService struct {
	db        *sql.DB
	menu      *MenuService
	deduction *DeductionEngine
}

func NewOrderService(db *sql.DB, menu *MenuService, deduction *DeductionEngine) *OrderService {
	return &OrderService{db: db, menu: menu, deduction: deduction}
}

type CreateOrderInput struct {
	Lines []struct {
		MenuItemID string `json:"menu_item_id"`
		Qty        int    `json:"qty"`
	} `json:"lines"`
	Source string `json:"source"`
}

type AggregatorLineInput struct {
	MenuItemID   string
	Name         string
	Qty          int
	PriceCents   int
}

type CreateAggregatorOrderInput struct {
	Lines      []AggregatorLineInput
	Source     string
	TotalCents int
	PlacedAt   *time.Time
}

const (
	OrderStatusProcessed  = "processed"
	OrderStatusInProcess  = "in_process"
)

func formatItemsSummary(lines []OrderLine) string {
	if len(lines) == 0 {
		return ""
	}
	parts := make([]string, 0, len(lines))
	for _, l := range lines {
		name := strings.TrimSpace(l.MenuItemName)
		if name == "" {
			continue
		}
		qty := l.Qty
		if qty <= 0 {
			qty = 1
		}
		parts = append(parts, fmt.Sprintf("%s × %d", name, qty))
	}
	return strings.Join(parts, " · ")
}

func (s *OrderService) attachExternalOrderID(ctx context.Context, o *Order) {
	if o == nil || o.OrderID == "" {
		return
	}
	var ext sql.NullString
	_ = s.db.QueryRowContext(ctx, `
		SELECT external_order_id FROM zomato_external_orders
		WHERE order_id = $1 LIMIT 1
	`, o.OrderID).Scan(&ext)
	if ext.Valid {
		o.ExternalOrderID = ext.String
	}
}

func (s *OrderService) enrichOrder(ctx context.Context, o *Order) error {
	lines, err := s.loadOrderLines(ctx, o.OrderID)
	if err != nil {
		return err
	}
	o.Lines = lines
	o.ItemsSummary = formatItemsSummary(lines)
	s.attachExternalOrderID(ctx, o)
	return nil
}

func (s *OrderService) ListOrders(ctx context.Context, kitchenID string, in ListOrdersParams) (OrderListPage, error) {
	limit := in.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	counts, err := s.loadOrderStatusCounts(ctx, kitchenID)
	if err != nil {
		return OrderListPage{}, err
	}

	cursorTime, cursorID, err := decodeOrderCursor(in.Cursor)
	if err != nil {
		return OrderListPage{}, fmt.Errorf("invalid cursor")
	}

	statusFilter := strings.TrimSpace(in.Status)
	args := []any{kitchenID}
	where := "WHERE ro.kitchen_id = $1"
	argN := 2

	if statusFilter != "" && statusFilter != "all" {
		switch statusFilter {
		case OrderStatusInProcess, "open", OrderStatusProcessed, "completed", "void":
			if statusFilter == OrderStatusProcessed {
				where += fmt.Sprintf(" AND ro.status IN ($%d, $%d)", argN, argN+1)
				args = append(args, OrderStatusProcessed, "completed")
				argN += 2
			} else {
				where += fmt.Sprintf(" AND ro.status = $%d", argN)
				args = append(args, statusFilter)
				argN++
			}
		default:
			return OrderListPage{}, fmt.Errorf("invalid status filter")
		}
	}

	if cursorID != "" {
		where += fmt.Sprintf(" AND (ro.created_at, ro.order_id) < ($%d, $%d::uuid)", argN, argN+1)
		args = append(args, cursorTime, cursorID)
		argN += 2
	}

	query := fmt.Sprintf(`
		SELECT ro.order_id::text, ro.kitchen_id::text, ro.created_by::text, ro.status, ro.source, ro.total_cents,
		       ro.completed_at, ro.voided_at, ro.created_at, ro.updated_at
		FROM restaurant_orders ro
		%s
		ORDER BY ro.created_at DESC, ro.order_id DESC
		LIMIT $%d
	`, where, argN)
	args = append(args, limit+1)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return OrderListPage{}, err
	}
	defer rows.Close()

	out := make([]Order, 0, limit)
	orderIDs := make([]string, 0, limit)
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			return OrderListPage{}, err
		}
		out = append(out, o)
		orderIDs = append(orderIDs, o.OrderID)
	}
	if err := rows.Err(); err != nil {
		return OrderListPage{}, err
	}

	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
		orderIDs = orderIDs[:limit]
	}

	page := OrderListPage{
		Orders:       out,
		HasMore:      hasMore,
		StatusCounts: counts,
	}
	if hasMore && len(out) > 0 {
		last := out[len(out)-1]
		page.NextCursor = encodeOrderCursor(last.CreatedAt, last.OrderID)
	}

	if len(out) == 0 {
		return page, nil
	}

	linesByOrder, err := s.loadOrderLinesBatch(ctx, orderIDs)
	if err != nil {
		return OrderListPage{}, err
	}
	extByOrder, err := s.loadExternalOrderIDsBatch(ctx, orderIDs)
	if err != nil {
		return OrderListPage{}, err
	}

	for i := range page.Orders {
		page.Orders[i].Lines = linesByOrder[page.Orders[i].OrderID]
		page.Orders[i].ItemsSummary = formatItemsSummary(page.Orders[i].Lines)
		if ext, ok := extByOrder[page.Orders[i].OrderID]; ok {
			page.Orders[i].ExternalOrderID = ext
		}
	}
	return page, nil
}

func encodeOrderCursor(t time.Time, orderID string) string {
	return t.UTC().Format(time.RFC3339Nano) + "|" + orderID
}

func decodeOrderCursor(cursor string) (time.Time, string, error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return time.Time{}, "", nil
	}
	parts := strings.SplitN(cursor, "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", fmt.Errorf("bad cursor")
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", err
	}
	return t, parts[1], nil
}

func (s *OrderService) loadOrderStatusCounts(ctx context.Context, kitchenID string) (OrderStatusCounts, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT status, COUNT(*)
		FROM restaurant_orders
		WHERE kitchen_id = $1
		GROUP BY status
	`, kitchenID)
	if err != nil {
		return OrderStatusCounts{}, err
	}
	defer rows.Close()

	var counts OrderStatusCounts
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return OrderStatusCounts{}, err
		}
		counts.All += n
		switch status {
		case OrderStatusInProcess:
			counts.InProcess += n
		case "open":
			counts.Open += n
		case OrderStatusProcessed, "completed":
			counts.Processed += n
		case "void":
			counts.Void += n
		}
	}
	return counts, rows.Err()
}

func (s *OrderService) GetOrder(ctx context.Context, kitchenID, orderID string) (*Order, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT order_id::text, kitchen_id::text, created_by::text, status, source, total_cents,
		       completed_at, voided_at, created_at, updated_at
		FROM restaurant_orders
		WHERE order_id = $1 AND kitchen_id = $2
	`, orderID, kitchenID)
	o, err := scanOrderRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	lines, err := s.loadOrderLines(ctx, orderID)
	if err != nil {
		return nil, err
	}
	o.Lines = lines
	o.ItemsSummary = formatItemsSummary(lines)
	s.attachExternalOrderID(ctx, &o)
	if orderStatusHasDeductions(o.Status) {
		used, err := s.loadOrderIngredientsUsed(ctx, orderID)
		if err != nil {
			return nil, err
		}
		o.IngredientsUsed = used
	}
	return &o, nil
}

func orderStatusHasDeductions(status string) bool {
	return status == OrderStatusProcessed || status == "completed"
}

func (s *OrderService) CreateOrder(ctx context.Context, kitchenID, userID string, in CreateOrderInput) (*Order, error) {
	if len(in.Lines) == 0 {
		return nil, fmt.Errorf("at least one line required")
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "pos"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var orderID string
	var totalCents int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO restaurant_orders (kitchen_id, created_by, status, source, total_cents)
		VALUES ($1, $2, 'open', $3, 0)
		RETURNING order_id::text
	`, kitchenID, userID, source).Scan(&orderID)
	if err != nil {
		return nil, err
	}

	for _, line := range in.Lines {
		if line.Qty <= 0 {
			continue
		}
		var name string
		var price int
		err := tx.QueryRowContext(ctx, `
			SELECT name, price_cents FROM menu_items
			WHERE menu_item_id = $1 AND kitchen_id = $2 AND is_active = TRUE
		`, line.MenuItemID, kitchenID).Scan(&name, &price)
		if err != nil {
			return nil, fmt.Errorf("invalid menu item %s", line.MenuItemID)
		}
		lineTotal := price * line.Qty
		totalCents += lineTotal
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO restaurant_order_lines (order_id, kitchen_id, menu_item_id, menu_item_name, qty, unit_price_cents, line_total_cents)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, orderID, kitchenID, line.MenuItemID, name, line.Qty, price, lineTotal); err != nil {
			return nil, err
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE restaurant_orders SET total_cents = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $1
	`, orderID, totalCents); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, kitchenID, orderID)
}

// CreateAggregatorOrder imports external order lines; menu_item_id is optional per line.
func (s *OrderService) CreateAggregatorOrder(ctx context.Context, kitchenID, userID string, in CreateAggregatorOrderInput) (*Order, error) {
	if len(in.Lines) == 0 {
		return nil, fmt.Errorf("at least one line required")
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "aggregator"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var orderID string
	totalCents := in.TotalCents
	createdAt := time.Now().UTC()
	if in.PlacedAt != nil {
		createdAt = in.PlacedAt.UTC()
	}
	err = tx.QueryRowContext(ctx, `
		INSERT INTO restaurant_orders (kitchen_id, created_by, status, source, total_cents, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING order_id::text
	`, kitchenID, userID, OrderStatusInProcess, source, totalCents, createdAt).Scan(&orderID)
	if err != nil {
		return nil, err
	}

	lineTotalSum := 0
	for _, line := range in.Lines {
		if line.Qty <= 0 {
			continue
		}
		name := strings.TrimSpace(line.Name)
		if name == "" {
			name = "Item"
		}
		price := line.PriceCents
		if price < 0 {
			price = 0
		}
		if strings.TrimSpace(line.MenuItemID) != "" {
			var menuName string
			var menuPrice int
			err := tx.QueryRowContext(ctx, `
				SELECT name, price_cents FROM menu_items
				WHERE menu_item_id = $1 AND kitchen_id = $2 AND is_active = TRUE
			`, line.MenuItemID, kitchenID).Scan(&menuName, &menuPrice)
			if err == nil {
				name = menuName
				if price == 0 {
					price = menuPrice
				}
			}
		}
		lineTotal := price * line.Qty
		lineTotalSum += lineTotal

		var menuItemID any
		if strings.TrimSpace(line.MenuItemID) != "" {
			menuItemID = line.MenuItemID
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO restaurant_order_lines (order_id, kitchen_id, menu_item_id, menu_item_name, qty, unit_price_cents, line_total_cents)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, orderID, kitchenID, menuItemID, name, line.Qty, price, lineTotal); err != nil {
			return nil, err
		}
	}

	if totalCents == 0 && lineTotalSum > 0 {
		totalCents = lineTotalSum
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE restaurant_orders SET total_cents = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $1
	`, orderID, totalCents); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, kitchenID, orderID)
}

// ProcessAggregatorInventory deducts stock when menu, recipe, and inventory all resolve; otherwise leaves in_process.
func (s *OrderService) ProcessAggregatorInventory(ctx context.Context, kitchenID, orderID, userID string) (string, error) {
	order, err := s.ProcessOrderInventory(ctx, kitchenID, orderID, userID)
	if err != nil {
		// Auto-sync keeps order in_process when deduction cannot complete.
		current, getErr := s.GetOrder(ctx, kitchenID, orderID)
		if getErr != nil {
			return "", getErr
		}
		if current == nil {
			return "", fmt.Errorf("order not found")
		}
		return current.Status, nil
	}
	return order.Status, nil
}

// ProcessOrderInventory deducts recipe stock and marks the order processed. Returns explicit errors for manual processing.
func (s *OrderService) ProcessOrderInventory(ctx context.Context, kitchenID, orderID, userID string) (*Order, error) {
	order, err := s.GetOrder(ctx, kitchenID, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, fmt.Errorf("order not found")
	}
	if orderStatusHasDeductions(order.Status) {
		return order, nil
	}
	if order.Status == "open" {
		return s.CompleteOrder(ctx, kitchenID, orderID, userID)
	}
	if order.Status != OrderStatusInProcess {
		return nil, fmt.Errorf("order cannot be processed (status: %s)", order.Status)
	}

	if _, err := s.RelinkOrderLines(ctx, kitchenID, orderID); err != nil {
		return nil, err
	}
	order, err = s.GetOrder(ctx, kitchenID, orderID)
	if err != nil {
		return nil, err
	}

	items, err := s.deduction.inventory.ListByKitchen(ctx, kitchenID)
	if err != nil {
		return nil, err
	}

	recipeMap := map[string][]RecipeIngredient{}
	for _, line := range order.Lines {
		if strings.TrimSpace(line.MenuItemID) == "" {
			continue
		}
		ings, err := s.menu.GetRecipeIngredients(ctx, kitchenID, line.MenuItemID)
		if err != nil {
			return nil, err
		}
		recipeMap[line.MenuItemID] = ings
	}

	if missing := s.deduction.ValidateDeduction(order.Lines, recipeMap, items); len(missing) > 0 {
		return nil, fmt.Errorf("cannot deduct stock: %s", strings.Join(missing, "; "))
	}

	// Claim the order before deducting so concurrent process requests cannot double-deduct.
	res, err := s.db.ExecContext(ctx, `
		UPDATE restaurant_orders
		SET status = $3, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE order_id = $1 AND kitchen_id = $2 AND status = $4
	`, orderID, kitchenID, OrderStatusProcessed, OrderStatusInProcess)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return s.GetOrder(ctx, kitchenID, orderID)
	}

	if _, err := s.deduction.DeductForOrder(ctx, kitchenID, orderID, userID, order.Lines, recipeMap); err != nil {
		_, _ = s.db.ExecContext(ctx, `
			UPDATE restaurant_orders
			SET status = $4, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE order_id = $1 AND kitchen_id = $2 AND status = $3
		`, orderID, kitchenID, OrderStatusProcessed, OrderStatusInProcess)
		return nil, err
	}
	return s.GetOrder(ctx, kitchenID, orderID)
}

// RelinkOrderLines sets menu_item_id on order lines by matching menu_item_name to the kitchen menu.
func (s *OrderService) RelinkOrderLines(ctx context.Context, kitchenID, orderID string) (int, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE restaurant_order_lines rol
		SET menu_item_id = mi.menu_item_id
		FROM menu_items mi
		WHERE rol.order_id = $1 AND rol.kitchen_id = $2
		  AND rol.menu_item_id IS NULL
		  AND mi.kitchen_id = $2 AND mi.is_active = TRUE
		  AND lower(trim(rol.menu_item_name)) = lower(trim(mi.name))
	`, orderID, kitchenID)
	if err != nil {
		return 0, err
	}
	linked, _ := res.RowsAffected()

	menuItems, err := s.menu.ListMenuItems(ctx, kitchenID, true)
	if err != nil {
		return int(linked), err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT line_id::text, menu_item_name
		FROM restaurant_order_lines
		WHERE order_id = $1 AND kitchen_id = $2 AND menu_item_id IS NULL
	`, orderID, kitchenID)
	if err != nil {
		return int(linked), err
	}
	defer rows.Close()

	for rows.Next() {
		var lineID, name string
		if err := rows.Scan(&lineID, &name); err != nil {
			return int(linked), err
		}
		menuItemID := MatchMenuItemByName(menuItems, name)
		if menuItemID == "" {
			continue
		}
		res, err := s.db.ExecContext(ctx, `
			UPDATE restaurant_order_lines
			SET menu_item_id = $3
			WHERE line_id = $1 AND kitchen_id = $2 AND menu_item_id IS NULL
		`, lineID, kitchenID, menuItemID)
		if err != nil {
			return int(linked), err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			linked++
		}
	}
	return int(linked), rows.Err()
}

// BackfillOrderMenuLinks relinks all unlinked lines for in_process orders in a kitchen.
func (s *OrderService) BackfillOrderMenuLinks(ctx context.Context, kitchenID string) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT order_id::text
		FROM restaurant_orders
		WHERE kitchen_id = $1 AND status = $2
	`, kitchenID, OrderStatusInProcess)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	total := 0
	for rows.Next() {
		var orderID string
		if err := rows.Scan(&orderID); err != nil {
			return total, err
		}
		n, err := s.RelinkOrderLines(ctx, kitchenID, orderID)
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, rows.Err()
}

func (s *OrderService) CompleteOrder(ctx context.Context, kitchenID, orderID, userID string) (*Order, error) {
	order, err := s.GetOrder(ctx, kitchenID, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, fmt.Errorf("order not found")
	}
	if order.Status != "open" {
		return nil, fmt.Errorf("order is not open")
	}

	recipeMap := map[string][]RecipeIngredient{}
	for _, line := range order.Lines {
		ings, err := s.menu.GetRecipeIngredients(ctx, kitchenID, line.MenuItemID)
		if err != nil {
			return nil, err
		}
		recipeMap[line.MenuItemID] = ings
	}

	if _, err := s.deduction.DeductForOrder(ctx, kitchenID, orderID, userID, order.Lines, recipeMap); err != nil {
		return nil, err
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE restaurant_orders
		SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE order_id = $1 AND kitchen_id = $2 AND status = 'open'
	`, orderID, kitchenID)
	if err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, kitchenID, orderID)
}

func (s *OrderService) VoidOrder(ctx context.Context, kitchenID, orderID, userID string) (*Order, error) {
	order, err := s.GetOrder(ctx, kitchenID, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, fmt.Errorf("order not found")
	}
	if order.Status == "void" {
		return order, nil
	}

	if order.Status == "completed" {
		movements, err := s.loadOrderMovements(ctx, orderID)
		if err != nil {
			return nil, err
		}
		if _, err := s.deduction.ReverseOrder(ctx, kitchenID, orderID, userID, movements); err != nil {
			return nil, err
		}
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE restaurant_orders
		SET status = 'void', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE order_id = $1 AND kitchen_id = $2
	`, orderID, kitchenID)
	if err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, kitchenID, orderID)
}

func (s *OrderService) UsageReport(ctx context.Context, kitchenID string, from, to time.Time) ([]UsageReportRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DATE(im.created_at)::text,
		       COALESCE(i.food_group, 'other'),
		       SUM(ABS(im.delta_qty)),
		       COUNT(DISTINCT im.item_id)
		FROM inventory_movements im
		JOIN inventory i ON i.item_id = im.item_id
		WHERE im.kitchen_id = $1
		  AND im.reason = 'order_deduct'
		  AND im.created_at >= $2 AND im.created_at < $3
		GROUP BY 1, 2
		ORDER BY 1 DESC, 2
	`, kitchenID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []UsageReportRow
	for rows.Next() {
		var r UsageReportRow
		if err := rows.Scan(&r.Date, &r.FoodGroup, &r.TotalQty, &r.ItemCount); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *OrderService) loadOrderLines(ctx context.Context, orderID string) ([]OrderLine, error) {
	byOrder, err := s.loadOrderLinesBatch(ctx, []string{orderID})
	if err != nil {
		return nil, err
	}
	return byOrder[orderID], nil
}

func (s *OrderService) loadOrderLinesBatch(ctx context.Context, orderIDs []string) (map[string][]OrderLine, error) {
	out := make(map[string][]OrderLine, len(orderIDs))
	if len(orderIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT line_id::text, order_id::text, menu_item_id::text, menu_item_name, qty, unit_price_cents, line_total_cents
		FROM restaurant_order_lines
		WHERE order_id = ANY($1::uuid[])
		ORDER BY order_id, created_at
	`, pq.Array(orderIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var l OrderLine
		var menuItemID sql.NullString
		if err := rows.Scan(&l.LineID, &l.OrderID, &menuItemID, &l.MenuItemName, &l.Qty, &l.UnitPriceCents, &l.LineTotalCents); err != nil {
			return nil, err
		}
		if menuItemID.Valid {
			l.MenuItemID = menuItemID.String
		}
		out[l.OrderID] = append(out[l.OrderID], l)
	}
	return out, rows.Err()
}

func (s *OrderService) loadExternalOrderIDsBatch(ctx context.Context, orderIDs []string) (map[string]string, error) {
	out := make(map[string]string, len(orderIDs))
	if len(orderIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT order_id::text, external_order_id
		FROM zomato_external_orders
		WHERE order_id = ANY($1::uuid[])
	`, pq.Array(orderIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var orderID, externalID string
		if err := rows.Scan(&orderID, &externalID); err != nil {
			return nil, err
		}
		out[orderID] = externalID
	}
	return out, rows.Err()
}

func (s *OrderService) loadOrderIngredientsUsed(ctx context.Context, orderID string) ([]OrderIngredientUsed, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT MIN(i.item_id::text), MIN(i.canonical_name), ABS(SUM(im.delta_qty)), i.unit
		FROM inventory_movements im
		JOIN inventory i ON i.item_id = im.item_id
		WHERE im.order_id = $1
		  AND im.reason IN ('order_deduct', 'void_reversal')
		GROUP BY LOWER(TRIM(i.canonical_name)), i.unit
		HAVING SUM(im.delta_qty) < 0
		ORDER BY MIN(i.canonical_name)
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OrderIngredientUsed
	for rows.Next() {
		var u OrderIngredientUsed
		if err := rows.Scan(&u.ItemID, &u.Name, &u.Qty, &u.Unit); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *OrderService) loadOrderMovements(ctx context.Context, orderID string) ([]contracts.InventoryMovement, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT movement_id::text, kitchen_id::text, item_id::text, actor_user_id::text,
		       order_id::text, delta_qty, reason, created_at
		FROM inventory_movements WHERE order_id = $1 AND reason = 'order_deduct'
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []contracts.InventoryMovement
	for rows.Next() {
		var m contracts.InventoryMovement
		var oid sql.NullString
		if err := rows.Scan(&m.MovementID, &m.KitchenID, &m.ItemID, &m.ActorUserID, &oid, &m.DeltaQty, &m.Reason, &m.CreatedAt); err != nil {
			return nil, err
		}
		if oid.Valid {
			m.OrderID = &oid.String
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanOrder(rows *sql.Rows) (Order, error) {
	return scanOrderRow(rows)
}

func scanOrderRow(row rowScanner) (Order, error) {
	var o Order
	var completed, voided sql.NullTime
	if err := row.Scan(&o.OrderID, &o.KitchenID, &o.CreatedBy, &o.Status, &o.Source, &o.TotalCents, &completed, &voided, &o.CreatedAt, &o.UpdatedAt); err != nil {
		return o, err
	}
	if completed.Valid {
		t := completed.Time
		o.CompletedAt = &t
	}
	if voided.Valid {
		t := voided.Time
		o.VoidedAt = &t
	}
	return o, nil
}
