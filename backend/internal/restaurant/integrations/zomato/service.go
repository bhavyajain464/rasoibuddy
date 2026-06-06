package zomato

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	restsvc "kitchenai-backend/internal/restaurant/services"
)

const (
	StatusIdle          = "idle"
	StatusRunning       = "running"
	StatusError         = "error"
	StatusLoginRequired = "login_required"
)

var (
	placedDayMonthRe     = regexp.MustCompile(`(?i)^(\d{1,2})\s+([A-Za-z]+)(?:\s+\|\s+)?(.*)$`)
	placedTimeDayRe      = regexp.MustCompile(`(?i)^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*\|\s*(Today|Yesterday)$`)
	placedTimeDayMonthRe = regexp.MustCompile(`(?i)^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*\|\s*(\d{1,2})\s+([A-Za-z]+)$`)
)

var monthNames = map[string]time.Month{
	"jan": time.January, "january": time.January,
	"feb": time.February, "february": time.February,
	"mar": time.March, "march": time.March,
	"apr": time.April, "april": time.April,
	"may": time.May,
	"jun": time.June, "june": time.June,
	"jul": time.July, "july": time.July,
	"aug": time.August, "august": time.August,
	"sep": time.September, "sept": time.September, "september": time.September,
	"oct": time.October, "october": time.October,
	"nov": time.November, "november": time.November,
	"dec": time.December, "december": time.December,
}

func parseZomatoPlacedAt(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	loc := istLocation()
	for _, layout := range []string{time.RFC3339, time.RFC3339Nano, "2006-01-02T15:04:05Z07:00"} {
		if t, err := time.Parse(layout, raw); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	now := time.Now().In(loc)
	if m := placedTimeDayRe.FindStringSubmatch(raw); len(m) == 3 {
		base := now
		switch strings.ToLower(m[2]) {
		case "yesterday":
			base = now.AddDate(0, 0, -1)
		}
		for _, layout := range []string{"3:04 PM", "15:04"} {
			if t, err := time.ParseInLocation(layout, strings.TrimSpace(m[1]), loc); err == nil {
				combined := time.Date(base.Year(), base.Month(), base.Day(), t.Hour(), t.Minute(), 0, 0, loc)
				utc := combined.UTC()
				return &utc
			}
		}
	}
	if m := placedTimeDayMonthRe.FindStringSubmatch(raw); len(m) == 4 {
		day, err := strconv.Atoi(m[2])
		if err != nil || day <= 0 {
			return nil
		}
		month, ok := monthNames[strings.ToLower(strings.TrimSpace(m[3]))]
		if !ok {
			return nil
		}
		base := time.Date(now.Year(), month, day, 0, 0, 0, 0, loc)
		if base.After(now.Add(36 * time.Hour)) {
			base = base.AddDate(-1, 0, 0)
		}
		for _, layout := range []string{"3:04 PM", "15:04"} {
			if t, err := time.ParseInLocation(layout, strings.TrimSpace(m[1]), loc); err == nil {
				combined := time.Date(base.Year(), base.Month(), base.Day(), t.Hour(), t.Minute(), 0, 0, loc)
				utc := combined.UTC()
				return &utc
			}
		}
	}
	if m := placedDayMonthRe.FindStringSubmatch(raw); len(m) >= 3 {
		day, err := strconv.Atoi(m[1])
		if err != nil || day <= 0 {
			return nil
		}
		month, ok := monthNames[strings.ToLower(strings.TrimSpace(m[2]))]
		if !ok {
			return nil
		}
		t := time.Date(now.Year(), month, day, 12, 0, 0, 0, loc)
		if t.After(now.Add(36 * time.Hour)) {
			t = t.AddDate(-1, 0, 0)
		}
		utc := t.UTC()
		return &utc
	}
	return nil
}

type SyncStatus struct {
	Status              string     `json:"status"`
	LastSyncAt          *time.Time `json:"last_sync_at,omitempty"`
	LastError           string     `json:"last_error,omitempty"`
	LastSyncMessage     string     `json:"last_sync_message,omitempty"`
	LastSyncOK          bool       `json:"last_sync_ok"`
	OrdersImportedCount int        `json:"orders_imported_count"`
	PollIntervalMinutes int        `json:"poll_interval_minutes"`
	NextPollAt          *time.Time `json:"next_poll_at,omitempty"`
	SessionSaved        bool       `json:"session_saved"`
	OutletID            string     `json:"outlet_id,omitempty"`
	OutletName          string     `json:"outlet_name,omitempty"`
	SyncMode            string     `json:"sync_mode,omitempty"`
}

type StartCredentials struct {
	OutletName   string          `json:"outlet_name"`
	OutletID     string          `json:"outlet_id"`
	AuthJSON     json.RawMessage `json:"auth_json,omitempty"`
	AuthVerified bool            `json:"-"`
}

type IngestLine struct {
	Name  string `json:"name"`
	Qty   int    `json:"qty"`
	Price int    `json:"price_cents,omitempty"`
}

type IngestOrder struct {
	ExternalOrderID string       `json:"external_order_id"`
	Lines           []IngestLine `json:"lines"`
	TotalCents      int          `json:"total_cents,omitempty"`
	PlacedAt        string       `json:"placed_at,omitempty"`
}

type kitchenSyncRow struct {
	Status              string
	LastSyncAt          sql.NullTime
	LastError           string
	LastSyncMessage     sql.NullString
	OrdersImportedCount int
	OutletID            sql.NullString
	OutletName          sql.NullString
	AuthJSON            []byte
	ActorUserID         sql.NullString
}

type Service struct {
	db         *sql.DB
	orders     *restsvc.OrderService
	menu       *restsvc.MenuService
	httpClient *http.Client
	sync       *syncManager
	connect    *connectStore
}

func NewService(db *sql.DB, orders *restsvc.OrderService, menu *restsvc.MenuService) *Service {
	return &Service{
		db:         db,
		orders:     orders,
		menu:       menu,
		httpClient: newZomatoHTTPClient(),
		sync:       newSyncManager(),
	}
}

func (s *Service) loadSyncRow(ctx context.Context, kitchenID string) (*kitchenSyncRow, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT status, last_sync_at, COALESCE(last_error, ''), last_sync_message,
		       orders_imported_count, outlet_id, outlet_name, auth_json, actor_user_id::text
		FROM zomato_kitchen_sync WHERE kitchen_id = $1
	`, kitchenID)
	var r kitchenSyncRow
	var auth sql.NullString
	err := row.Scan(&r.Status, &r.LastSyncAt, &r.LastError, &r.LastSyncMessage, &r.OrdersImportedCount,
		&r.OutletID, &r.OutletName, &auth, &r.ActorUserID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if auth.Valid {
		r.AuthJSON = []byte(auth.String)
	}
	return &r, nil
}

func (s *Service) GetStatus(ctx context.Context, kitchenID string) (*SyncStatus, error) {
	row, err := s.loadSyncRow(ctx, kitchenID)
	if err != nil {
		return nil, err
	}
	st := &SyncStatus{
		Status:              StatusIdle,
		PollIntervalMinutes: 5,
		SyncMode:            "api",
	}
	if row != nil {
		st.Status = row.Status
		st.LastError = row.LastError
		st.OrdersImportedCount = row.OrdersImportedCount
		if row.LastSyncMessage.Valid {
			st.LastSyncMessage = row.LastSyncMessage.String
		}
		st.LastSyncOK = row.LastError == "" && row.LastSyncAt.Valid
		if row.LastSyncAt.Valid {
			st.LastSyncAt = &row.LastSyncAt.Time
			if st.Status == StatusRunning || s.sync.running(kitchenID) {
				next := row.LastSyncAt.Time.Add(defaultPollInterval)
				st.NextPollAt = &next
			}
		}
		if row.OutletID.Valid {
			st.OutletID = row.OutletID.String
		}
		if row.OutletName.Valid {
			st.OutletName = row.OutletName.String
		}
		if len(row.AuthJSON) > 0 {
			st.SessionSaved = true
		}
	}
	if s.sync.running(kitchenID) {
		st.Status = StatusRunning
	}
	return st, nil
}

func (s *Service) StartSync(ctx context.Context, kitchenID, actorUserID string, creds StartCredentials) (*SyncStatus, error) {
	if s.sync.running(kitchenID) {
		return s.GetStatus(ctx, kitchenID)
	}
	outletID := strings.TrimSpace(creds.OutletID)
	outletName := strings.TrimSpace(creds.OutletName)
	if outletID == "" {
		return nil, fmt.Errorf("outlet_id required — Zomato restaurant ID (e.g. 22267610)")
	}
	if strings.TrimSpace(actorUserID) == "" {
		return nil, fmt.Errorf("actor user required")
	}

	row, _ := s.loadSyncRow(ctx, kitchenID)
	var auth *Auth
	var err error
	if len(creds.AuthJSON) > 0 {
		auth, err = ParseAuth(creds.AuthJSON)
		if err != nil {
			return nil, err
		}
	} else if row != nil && len(row.AuthJSON) > 0 {
		auth, err = ParseAuth(row.AuthJSON)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, fmt.Errorf("Zomato session required — paste partner cookies in Settings")
	}

	if !creds.AuthVerified {
		if err := s.verifyAuth(ctx, auth, outletID); err != nil {
			if ae, ok := err.(*AuthError); ok {
				_ = s.markLoginRequired(ctx, kitchenID, ae.Message)
			}
			return nil, err
		}
	}

	authRaw, _ := json.Marshal(auth)
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, outlet_id, outlet_name, auth_json, auth_refreshed_at, actor_user_id, last_error, updated_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, NULL, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			status = EXCLUDED.status,
			outlet_id = EXCLUDED.outlet_id,
			outlet_name = EXCLUDED.outlet_name,
			auth_json = EXCLUDED.auth_json,
			auth_refreshed_at = CURRENT_TIMESTAMP,
			actor_user_id = EXCLUDED.actor_user_id,
			last_error = NULL,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusRunning, outletID, outletName, string(authRaw), actorUserID); err != nil {
		return nil, err
	}

	s.sync.start(s, kitchenID, actorUserID, outletID, auth)
	return s.GetStatus(ctx, kitchenID)
}

func (s *Service) StopSync(ctx context.Context, kitchenID string) (*SyncStatus, error) {
	s.sync.stop(kitchenID)
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, updated_at)
		VALUES ($1, $2, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusIdle)
	return s.GetStatus(ctx, kitchenID)
}

func (s *Service) ResumeRunningSyncs(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT kitchen_id::text, COALESCE(outlet_id, ''), COALESCE(actor_user_id::text, ''), auth_json
		FROM zomato_kitchen_sync
		WHERE status = $1 AND outlet_id IS NOT NULL AND auth_json IS NOT NULL
	`, StatusRunning)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var kitchenID, outletID, actorID string
		var authJSON []byte
		if err := rows.Scan(&kitchenID, &outletID, &actorID, &authJSON); err != nil {
			continue
		}
		if outletID == "" || actorID == "" || len(authJSON) == 0 {
			continue
		}
		auth, err := ParseAuth(authJSON)
		if err != nil {
			continue
		}
		s.sync.start(s, kitchenID, actorID, outletID, auth)
	}
}

func (s *Service) MarkSyncError(ctx context.Context, kitchenID, msg string) error {
	pollMsg := "Poll failed — " + msg
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, last_error, last_sync_message, updated_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			status = EXCLUDED.status,
			last_error = EXCLUDED.last_error,
			last_sync_message = EXCLUDED.last_sync_message,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusError, msg, pollMsg)
	return err
}

// RecordPollError logs a failed poll but keeps sync status running so the worker keeps retrying.
func (s *Service) RecordPollError(ctx context.Context, kitchenID, msg string) error {
	pollMsg := "Poll failed — " + msg
	_, err := s.db.ExecContext(ctx, `
		UPDATE zomato_kitchen_sync SET
			last_error = $2,
			last_sync_message = $3,
			updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1 AND status = $4
	`, kitchenID, msg, pollMsg, StatusRunning)
	return err
}

func (s *Service) markLoginRequired(ctx context.Context, kitchenID, msg string) error {
	s.sync.stop(kitchenID)
	pollMsg := "Poll failed — " + msg
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, last_error, last_sync_message, updated_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			status = EXCLUDED.status,
			last_error = EXCLUDED.last_error,
			last_sync_message = EXCLUDED.last_sync_message,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusLoginRequired, msg, pollMsg)
	return err
}

type IngestResult struct {
	Imported        int
	Processed       int
	InProcess       int
	SkippedExisting int
}

func (s *Service) markPollSuccess(ctx context.Context, kitchenID string, fetched int, result IngestResult) error {
	var total int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM zomato_external_orders WHERE kitchen_id = $1
	`, kitchenID).Scan(&total)
	msg := fmt.Sprintf(
		"Poll OK — checked %d recent Zomato orders, %d new (%d processed, %d in process; %d total in KitchenAI)",
		fetched, result.Imported, result.Processed, result.InProcess, total,
	)
	if result.SkippedExisting > 0 {
		msg += fmt.Sprintf("; skipped %d already imported", result.SkippedExisting)
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE zomato_kitchen_sync SET
			last_sync_at = CURRENT_TIMESTAMP,
			last_error = NULL,
			last_sync_message = $2,
			updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1
	`, kitchenID, msg)
	return err
}

func (s *Service) MarkSyncOK(ctx context.Context, kitchenID string, imported int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, last_sync_at, orders_imported_count, last_error, updated_at)
		VALUES ($1, $2, CURRENT_TIMESTAMP, $3, NULL, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			status = EXCLUDED.status,
			last_sync_at = CURRENT_TIMESTAMP,
			orders_imported_count = zomato_kitchen_sync.orders_imported_count + $3,
			last_error = NULL,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusRunning, imported)
	return err
}

func (s *Service) IngestOrders(ctx context.Context, kitchenID, actorUserID string, orders []IngestOrder) (IngestResult, error) {
	out := IngestResult{}
	if len(orders) == 0 {
		return out, nil
	}
	menuItems, err := s.menu.ListMenuItems(ctx, kitchenID, true)
	if err != nil {
		return out, err
	}

	for _, ext := range orders {
		extID := strings.TrimSpace(ext.ExternalOrderID)
		if extID == "" {
			continue
		}
		var exists bool
		if err := s.db.QueryRowContext(ctx, `
			SELECT EXISTS(SELECT 1 FROM zomato_external_orders WHERE kitchen_id = $1 AND external_order_id = $2)
		`, kitchenID, extID).Scan(&exists); err != nil {
			return out, err
		}
		if exists {
			out.SkippedExisting++
			continue
		}

		aggLines := make([]restsvc.AggregatorLineInput, 0, len(ext.Lines))
		for _, ln := range ext.Lines {
			if ln.Qty <= 0 || strings.TrimSpace(ln.Name) == "" {
				continue
			}
			aggLines = append(aggLines, restsvc.AggregatorLineInput{
				MenuItemID: restsvc.MatchMenuItemByName(menuItems, ln.Name),
				Name:       strings.TrimSpace(ln.Name),
				Qty:        ln.Qty,
				PriceCents: ln.Price,
			})
		}
		if len(aggLines) == 0 {
			aggLines = []restsvc.AggregatorLineInput{{
				Name: "Zomato order",
				Qty:  1,
			}}
		}

		order, err := s.orders.CreateAggregatorOrder(ctx, kitchenID, actorUserID, restsvc.CreateAggregatorOrderInput{
			Lines:      aggLines,
			Source:     "aggregator",
			TotalCents: ext.TotalCents,
			PlacedAt:   parseZomatoPlacedAt(ext.PlacedAt),
		})
		if err != nil {
			return out, err
		}

		procStatus, err := s.orders.ProcessAggregatorInventory(ctx, kitchenID, order.OrderID, actorUserID)
		if err != nil {
			return out, err
		}
		if procStatus == restsvc.OrderStatusProcessed {
			out.Processed++
		} else {
			out.InProcess++
		}

		raw, _ := json.Marshal(ext)
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO zomato_external_orders (kitchen_id, external_order_id, order_id, raw_payload, processing_status)
			VALUES ($1, $2, $3, $4, $5)
		`, kitchenID, extID, order.OrderID, raw, procStatus); err != nil {
			return out, err
		}
		out.Imported++
	}
	if out.Imported > 0 {
		_ = s.MarkSyncOK(ctx, kitchenID, out.Imported)
	}
	return out, nil
}

// ImportOrderByExternalID fetches a single order via order-details when it is missing from history.
func (s *Service) ImportOrderByExternalID(ctx context.Context, kitchenID, actorUserID, externalOrderID string) (IngestResult, error) {
	externalOrderID = strings.TrimSpace(externalOrderID)
	if externalOrderID == "" {
		return IngestResult{}, fmt.Errorf("external_order_id required")
	}
	row, err := s.loadSyncRow(ctx, kitchenID)
	if err != nil {
		return IngestResult{}, err
	}
	if row == nil || len(row.AuthJSON) == 0 {
		return IngestResult{}, fmt.Errorf("Zomato session required — import partner cookies in Settings")
	}
	auth, err := ParseAuth(row.AuthJSON)
	if err != nil {
		return IngestResult{}, err
	}
	if actorUserID == "" && row.ActorUserID.Valid {
		actorUserID = row.ActorUserID.String
	}
	if actorUserID == "" {
		return IngestResult{}, fmt.Errorf("actor user required")
	}

	detail, err := s.getOrderDetails(ctx, auth, externalOrderID)
	if err != nil {
		return IngestResult{}, err
	}
	if detail == nil {
		return IngestResult{}, fmt.Errorf("order %s not found on Zomato", externalOrderID)
	}
	if row.OutletID.Valid && strings.TrimSpace(row.OutletID.String) != "" &&
		strings.TrimSpace(detail.ResID) != "" &&
		detail.ResID != row.OutletID.String {
		return IngestResult{}, fmt.Errorf("order %s belongs to outlet %s, not %s", externalOrderID, detail.ResID, row.OutletID.String)
	}

	merged := mergeFetchedOrder(&FetchedOrder{ExternalOrderID: externalOrderID}, detail)
	return s.IngestOrders(ctx, kitchenID, actorUserID, fetchedToIngest([]FetchedOrder{merged}))
}

// BackfillPlacedTimes sets restaurant_orders.created_at from stored Zomato placed_at when
// imports used sync time instead of the real order timestamp.
func (s *Service) BackfillPlacedTimes(ctx context.Context, kitchenID string) (int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT z.order_id::text, z.raw_payload, ro.created_at
		FROM zomato_external_orders z
		JOIN restaurant_orders ro ON ro.order_id = z.order_id
		WHERE z.kitchen_id = $1 AND z.raw_payload IS NOT NULL
	`, kitchenID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	updated := 0
	for rows.Next() {
		var orderID string
		var raw []byte
		var createdAt time.Time
		if err := rows.Scan(&orderID, &raw, &createdAt); err != nil {
			return updated, err
		}
		var payload IngestOrder
		if err := json.Unmarshal(raw, &payload); err != nil {
			continue
		}
		placed := parseZomatoPlacedAt(payload.PlacedAt)
		if placed == nil {
			continue
		}
		if placed.UTC().Sub(createdAt.UTC()).Abs() < 2*time.Minute {
			continue
		}
		if _, err := s.db.ExecContext(ctx, `
			UPDATE restaurant_orders SET created_at = $2, updated_at = CURRENT_TIMESTAMP
			WHERE order_id = $1
		`, orderID, placed.UTC()); err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}
