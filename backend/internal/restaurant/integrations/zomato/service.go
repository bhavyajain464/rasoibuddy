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

type PartnerWorkerStatus struct {
	Partner             string     `json:"partner"`
	PartnerOutletID     string     `json:"partner_outlet_id"`
	PartnerOutletName   string     `json:"partner_outlet_name,omitempty"`
	Status              string     `json:"status"`
	LastSyncAt          *time.Time `json:"last_sync_at,omitempty"`
	LastError           string     `json:"last_error,omitempty"`
	LastSyncMessage     string     `json:"last_sync_message,omitempty"`
	LastSyncOK          bool       `json:"last_sync_ok"`
	OrdersImportedCount int        `json:"orders_imported_count"`
	OrdersFetchedLastHour int      `json:"orders_fetched_last_hour"`
	PollIntervalMinutes int        `json:"poll_interval_minutes"`
	NextPollAt          *time.Time `json:"next_poll_at,omitempty"`
	SyncMode            string     `json:"sync_mode,omitempty"`
	// Legacy JSON aliases.
	PartnerStoreID string `json:"partner_store_id,omitempty"`
	PartnerStoreName string `json:"partner_store_name,omitempty"`
	OutletID       string `json:"outlet_id,omitempty"`
	OutletName     string `json:"outlet_name,omitempty"`
}

type OutletIntegrationsStatus struct {
	SessionSaved        bool                    `json:"session_saved"`
	PollIntervalMinutes int                     `json:"poll_interval_minutes"`
	SyncMode            string                  `json:"sync_mode"`
	Workers             []PartnerWorkerStatus   `json:"workers"`
	Outlets             []PartnerWorkerStatus   `json:"outlets,omitempty"`
}

// Legacy aliases used inside the zomato integration package.
type OutletSyncStatus = PartnerWorkerStatus
type KitchenZomatoStatus = OutletIntegrationsStatus
type SyncStatus = PartnerWorkerStatus

type StartCredentials struct {
	Partner            string          `json:"partner"`
	PartnerOutletID    string          `json:"partner_outlet_id"`
	PartnerOutletName  string          `json:"partner_outlet_name"`
	PartnerStoreID     string          `json:"partner_store_id"`
	PartnerStoreName   string          `json:"partner_store_name"`
	OutletName         string          `json:"outlet_name"`
	OutletID           string          `json:"outlet_id"`
	AuthJSON           json.RawMessage `json:"auth_json,omitempty"`
	AuthVerified       bool            `json:"-"`
}

func (c StartCredentials) resolvedPartner() string {
	p := strings.TrimSpace(c.Partner)
	if p == "" {
		return "zomato"
	}
	if p == "dine_in" || p == "dine-in" {
		return "dineout"
	}
	return p
}

func (c StartCredentials) resolvedPartnerOutletID() string {
	if id := normalizePartnerOutletID(c.PartnerOutletID); id != "" {
		return id
	}
	if id := normalizePartnerOutletID(c.PartnerStoreID); id != "" {
		return id
	}
	return normalizePartnerOutletID(c.OutletID)
}

func (c StartCredentials) resolvedPartnerOutletName() string {
	if n := strings.TrimSpace(c.PartnerOutletName); n != "" {
		return n
	}
	if n := strings.TrimSpace(c.PartnerStoreName); n != "" {
		return n
	}
	return strings.TrimSpace(c.OutletName)
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

type outletSyncRow struct {
	Status              string
	LastSyncAt          sql.NullTime
	LastError           string
	LastSyncMessage     sql.NullString
	OrdersImportedCount int
	Partner             string
	PartnerStoreID      string
	PartnerStoreName    sql.NullString
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

func (s *Service) loadKitchenAuth(ctx context.Context, kitchenID string) (*Auth, error) {
	var raw sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT auth_json FROM zomato_kitchen_auth WHERE kitchen_id = $1
	`, kitchenID).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !raw.Valid || raw.String == "" {
		return nil, nil
	}
	return ParseAuth([]byte(raw.String))
}

func (s *Service) hasKitchenAuth(ctx context.Context, kitchenID string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM zomato_kitchen_auth WHERE kitchen_id = $1)
	`, kitchenID).Scan(&exists)
	return exists, err
}

func scanPartnerWorkerRow(row *sql.Row) (*outletSyncRow, error) {
	var r outletSyncRow
	err := row.Scan(&r.Status, &r.LastSyncAt, &r.LastError, &r.LastSyncMessage, &r.OrdersImportedCount,
		&r.Partner, &r.PartnerStoreID, &r.PartnerStoreName, &r.ActorUserID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Service) loadOutletSyncRow(ctx context.Context, kitchenID, partnerStoreID string) (*outletSyncRow, error) {
	partnerStoreID = normalizeOutletID(partnerStoreID)
	row := s.db.QueryRowContext(ctx, `
		SELECT status, last_sync_at, COALESCE(last_error, ''), last_sync_message,
		       orders_imported_count, COALESCE(partner, 'zomato'), partner_outlet_id, partner_outlet_name, actor_user_id::text
		FROM partner_order_sync
		WHERE kitchen_id = $1 AND partner_outlet_id = $2
	`, kitchenID, partnerStoreID)
	return scanPartnerWorkerRow(row)
}

func (s *Service) listOutletSyncRows(ctx context.Context, kitchenID string) ([]outletSyncRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT status, last_sync_at, COALESCE(last_error, ''), last_sync_message,
		       orders_imported_count, COALESCE(partner, 'zomato'), partner_outlet_id, partner_outlet_name, actor_user_id::text
		FROM partner_order_sync
		WHERE kitchen_id = $1
		ORDER BY partner, partner_outlet_name NULLS LAST, partner_outlet_id
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []outletSyncRow
	for rows.Next() {
		var r outletSyncRow
		if err := rows.Scan(&r.Status, &r.LastSyncAt, &r.LastError, &r.LastSyncMessage, &r.OrdersImportedCount,
			&r.Partner, &r.PartnerStoreID, &r.PartnerStoreName, &r.ActorUserID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Service) rowToWorkerStatus(outletID string, row outletSyncRow) PartnerWorkerStatus {
	partner := strings.TrimSpace(row.Partner)
	if partner == "" {
		partner = "zomato"
	}
	storeName := ""
	if row.PartnerStoreName.Valid {
		storeName = row.PartnerStoreName.String
	}
	st := PartnerWorkerStatus{
		Partner:             partner,
		PartnerOutletID:     row.PartnerStoreID,
		PartnerOutletName:   storeName,
		PartnerStoreID:      row.PartnerStoreID,
		PartnerStoreName:    storeName,
		OutletID:            row.PartnerStoreID,
		OutletName:          storeName,
		Status:              row.Status,
		LastError:           row.LastError,
		OrdersImportedCount: row.OrdersImportedCount,
		PollIntervalMinutes: 5,
		SyncMode:            "api",
	}
	if row.LastSyncMessage.Valid {
		st.LastSyncMessage = row.LastSyncMessage.String
	}
	st.LastSyncOK = row.LastError == "" && row.LastSyncAt.Valid
	if row.LastSyncAt.Valid {
		st.LastSyncAt = &row.LastSyncAt.Time
		if st.Status == StatusRunning || s.sync.running(outletID, row.PartnerStoreID) {
			next := row.LastSyncAt.Time.Add(defaultPollInterval)
			st.NextPollAt = &next
		}
	}
	if s.sync.running(outletID, row.PartnerStoreID) {
		st.Status = StatusRunning
	}
	return st
}

func (s *Service) countOrdersFetchedLastHour(ctx context.Context, kitchenID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*)::int
		FROM zomato_external_orders z
		INNER JOIN restaurant_orders ro ON ro.order_id = z.order_id
		WHERE z.kitchen_id = $1
		  AND ro.created_at >= (CURRENT_TIMESTAMP - INTERVAL '1 hour')
	`, kitchenID).Scan(&n)
	return n, err
}

func (s *Service) GetKitchenStatus(ctx context.Context, kitchenID string) (*KitchenZomatoStatus, error) {
	sessionSaved, err := s.hasKitchenAuth(ctx, kitchenID)
	if err != nil {
		return nil, err
	}
	rows, err := s.listOutletSyncRows(ctx, kitchenID)
	if err != nil {
		return nil, err
	}
	fetchedLastHour := 0
	if n, err := s.countOrdersFetchedLastHour(ctx, kitchenID); err == nil {
		fetchedLastHour = n
	}
	st := &OutletIntegrationsStatus{
		SessionSaved:        sessionSaved,
		PollIntervalMinutes: 5,
		SyncMode:            "api",
		Workers:             make([]PartnerWorkerStatus, 0, len(rows)),
	}
	for _, row := range rows {
		w := s.rowToWorkerStatus(kitchenID, row)
		w.OrdersFetchedLastHour = fetchedLastHour
		st.Workers = append(st.Workers, w)
	}
	st.Outlets = st.Workers
	return st, nil
}

// GetStatus returns partner worker status for an outlet (all partners).
func (s *Service) GetStatus(ctx context.Context, kitchenID string) (*OutletIntegrationsStatus, error) {
	return s.GetKitchenStatus(ctx, kitchenID)
}

func (s *Service) assertPartnerStoreAvailable(ctx context.Context, outletID, partnerStoreID string) error {
	partnerStoreID = normalizeOutletID(partnerStoreID)
	existing, err := s.KitchenIDByOutletID(ctx, partnerStoreID)
	if err != nil {
		return nil
	}
	if existing != outletID {
		return fmt.Errorf("partner store %s is already linked to another outlet", partnerStoreID)
	}
	return nil
}

func (s *Service) resolveAuth(ctx context.Context, kitchenID string, creds StartCredentials) (*Auth, error) {
	if len(creds.AuthJSON) > 0 {
		return ParseAuth(creds.AuthJSON)
	}
	auth, err := s.loadKitchenAuth(ctx, kitchenID)
	if err != nil {
		return nil, err
	}
	if auth == nil {
		return nil, fmt.Errorf("Zomato session required — paste partner cookies in Settings")
	}
	return auth, nil
}

func (s *Service) upsertPartnerWorker(ctx context.Context, outletID, actorUserID, partner, partnerStoreID, partnerStoreName, status string) error {
	partnerStoreID = normalizeOutletID(partnerStoreID)
	partner = strings.TrimSpace(partner)
	if partner == "" {
		partner = "zomato"
	}
	partnerStoreName = strings.TrimSpace(partnerStoreName)
	if partnerStoreName == "" {
		partnerStoreName = partner + " store " + partnerStoreID
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO partner_order_sync (kitchen_id, partner, partner_outlet_id, partner_outlet_name, status, actor_user_id, last_error, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NULL, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id, partner) DO UPDATE SET
			partner_outlet_id = EXCLUDED.partner_outlet_id,
			partner_outlet_name = EXCLUDED.partner_outlet_name,
			status = EXCLUDED.status,
			actor_user_id = EXCLUDED.actor_user_id,
			last_error = NULL,
			updated_at = CURRENT_TIMESTAMP
	`, outletID, partner, partnerStoreID, partnerStoreName, status, actorUserID)
	if err != nil && strings.Contains(err.Error(), "no unique or exclusion constraint") {
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO partner_order_sync (kitchen_id, partner_outlet_id, partner_outlet_name, status, actor_user_id, last_error, updated_at)
			VALUES ($1, $2, $3, $4, $5, NULL, CURRENT_TIMESTAMP)
			ON CONFLICT (kitchen_id, partner_outlet_id) DO UPDATE SET
				partner_outlet_name = EXCLUDED.partner_outlet_name,
				status = EXCLUDED.status,
				actor_user_id = EXCLUDED.actor_user_id,
				last_error = NULL,
				updated_at = CURRENT_TIMESTAMP
		`, outletID, partnerStoreID, partnerStoreName, status, actorUserID)
	}
	return err
}

func (s *Service) StartSync(ctx context.Context, outletID, actorUserID string, creds StartCredentials) (*OutletIntegrationsStatus, error) {
	partner := creds.resolvedPartner()
	partnerOutletID := creds.resolvedPartnerOutletID()
	partnerOutletName := creds.resolvedPartnerOutletName()
	if partnerOutletID == "" {
		return nil, fmt.Errorf("partner_outlet_id required — partner platform store id")
	}
	if strings.TrimSpace(actorUserID) == "" {
		return nil, fmt.Errorf("actor user required")
	}
	if s.sync.running(outletID, partnerOutletID) {
		return s.GetKitchenStatus(ctx, outletID)
	}

	auth, err := s.resolveAuth(ctx, outletID, creds)
	if err != nil {
		return nil, err
	}
	if err := s.assertPartnerStoreAvailable(ctx, outletID, partnerOutletID); err != nil {
		return nil, err
	}
	if !creds.AuthVerified {
		if err := s.verifyAuth(ctx, auth, partnerOutletID); err != nil {
			if ae, ok := err.(*AuthError); ok {
				_ = s.markLoginRequired(ctx, outletID, partnerOutletID, ae.Message)
			}
			return nil, err
		}
	}
	if err := s.saveKitchenAuth(ctx, outletID, auth); err != nil {
		return nil, err
	}
	if err := s.upsertPartnerWorker(ctx, outletID, actorUserID, partner, partnerOutletID, partnerOutletName, StatusRunning); err != nil {
		return nil, err
	}

	s.sync.start(s, outletID, actorUserID, partnerOutletID, auth)
	return s.GetKitchenStatus(ctx, outletID)
}

func (s *Service) StopSync(ctx context.Context, outletID, partnerStoreID string) (*OutletIntegrationsStatus, error) {
	partnerStoreID = normalizeOutletID(partnerStoreID)
	if partnerStoreID == "" {
		return nil, fmt.Errorf("partner_outlet_id required")
	}
	s.sync.stop(outletID, partnerStoreID)
	_, _ = s.db.ExecContext(ctx, `
		UPDATE partner_order_sync
		SET status = $3, updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1 AND partner_outlet_id = $2
	`, outletID, partnerStoreID, StatusIdle)
	return s.GetKitchenStatus(ctx, outletID)
}

func (s *Service) ResumeRunningSyncs(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT o.kitchen_id::text, o.partner_outlet_id, COALESCE(o.actor_user_id::text, ''), a.auth_json
		FROM partner_order_sync o
		JOIN zomato_kitchen_auth a ON a.kitchen_id = o.kitchen_id
		WHERE o.status = $1
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

func (s *Service) MarkSyncError(ctx context.Context, kitchenID, outletID, msg string) error {
	outletID = normalizeOutletID(outletID)
	if outletID == "" {
		return fmt.Errorf("partner_outlet_id required")
	}
	pollMsg := "Poll failed — " + msg
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO partner_order_sync (kitchen_id, partner_outlet_id, status, last_error, last_sync_message, updated_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id, partner_outlet_id) DO UPDATE SET
			status = EXCLUDED.status,
			last_error = EXCLUDED.last_error,
			last_sync_message = EXCLUDED.last_sync_message,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, outletID, StatusError, msg, pollMsg)
	return err
}

// RecordPollError logs a failed poll but keeps sync status running so the worker keeps retrying.
func (s *Service) RecordPollError(ctx context.Context, kitchenID, outletID, msg string) error {
	outletID = normalizeOutletID(outletID)
	pollMsg := "Poll failed — " + msg
	_, err := s.db.ExecContext(ctx, `
		UPDATE partner_order_sync SET
			last_error = $3,
			last_sync_message = $4,
			updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1 AND partner_outlet_id = $2 AND status = $5
	`, kitchenID, outletID, msg, pollMsg, StatusRunning)
	return err
}

func (s *Service) markLoginRequired(ctx context.Context, kitchenID, outletID, msg string) error {
	outletID = normalizeOutletID(outletID)
	s.sync.stop(kitchenID, outletID)
	pollMsg := "Poll failed — " + msg
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO partner_order_sync (kitchen_id, partner_outlet_id, status, last_error, last_sync_message, updated_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id, partner_outlet_id) DO UPDATE SET
			status = EXCLUDED.status,
			last_error = EXCLUDED.last_error,
			last_sync_message = EXCLUDED.last_sync_message,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, outletID, StatusLoginRequired, msg, pollMsg)
	return err
}

type IngestResult struct {
	Imported        int
	Processed       int
	InProcess       int
	SkippedExisting int
}

func (s *Service) markPollSuccess(ctx context.Context, kitchenID, outletID string, fetched int, result IngestResult) error {
	outletID = normalizeOutletID(outletID)
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
		UPDATE partner_order_sync SET
			last_sync_at = CURRENT_TIMESTAMP,
			last_error = NULL,
			last_sync_message = $3,
			updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1 AND partner_outlet_id = $2
	`, kitchenID, outletID, msg)
	return err
}

func (s *Service) MarkSyncOK(ctx context.Context, kitchenID, outletID string, imported int) error {
	outletID = normalizeOutletID(outletID)
	_, err := s.db.ExecContext(ctx, `
		UPDATE partner_order_sync SET
			status = $3,
			last_sync_at = CURRENT_TIMESTAMP,
			orders_imported_count = orders_imported_count + $4,
			last_error = NULL,
			updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1 AND partner_outlet_id = $2
	`, kitchenID, outletID, StatusRunning, imported)
	return err
}

func (s *Service) IngestOrders(ctx context.Context, kitchenID, outletID, actorUserID string, orders []IngestOrder) (IngestResult, error) {
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
		_ = s.MarkSyncOK(ctx, kitchenID, outletID, out.Imported)
	}
	return out, nil
}

// ImportOrderByExternalID fetches a single order via order-details when it is missing from history.
func (s *Service) ImportOrderByExternalID(ctx context.Context, kitchenID, actorUserID, outletID, externalOrderID string) (IngestResult, error) {
	externalOrderID = strings.TrimSpace(externalOrderID)
	outletID = normalizeOutletID(outletID)
	if externalOrderID == "" {
		return IngestResult{}, fmt.Errorf("external_order_id required")
	}
	auth, err := s.loadKitchenAuth(ctx, kitchenID)
	if err != nil {
		return IngestResult{}, err
	}
	if auth == nil {
		return IngestResult{}, fmt.Errorf("Zomato session required — import partner cookies in Settings")
	}
	if actorUserID == "" {
		row, err := s.loadOutletSyncRow(ctx, kitchenID, outletID)
		if err != nil {
			return IngestResult{}, err
		}
		if row != nil && row.ActorUserID.Valid {
			actorUserID = row.ActorUserID.String
		}
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
	if outletID != "" && strings.TrimSpace(detail.ResID) != "" && detail.ResID != outletID {
		return IngestResult{}, fmt.Errorf("order %s belongs to outlet %s, not %s", externalOrderID, detail.ResID, outletID)
	}
	if outletID == "" && strings.TrimSpace(detail.ResID) != "" {
		outletID = detail.ResID
	}

	merged := mergeFetchedOrder(&FetchedOrder{ExternalOrderID: externalOrderID}, detail)
	return s.IngestOrders(ctx, kitchenID, outletID, actorUserID, fetchedToIngest([]FetchedOrder{merged}))
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
