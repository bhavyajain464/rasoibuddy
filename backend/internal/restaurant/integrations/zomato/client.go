package zomato

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	historyURL          = "https://api.zomato.com/merchant-gw/web/order/history/get-all-v2"
	orderDetailsURL     = "https://www.zomato.com/merchant-api/orders/order-details"
	orderDetailsGWURL   = "https://api.zomato.com/merchant-gw/web/order/history/get-order-details-v2"
	defaultMaxOrders    = 50
	defaultDaysBack     = 7
	defaultPollOrders   = 25
	defaultPollDaysBack = 2
)

var (
	mdInlineRe  = regexp.MustCompile(`<[^>|]+\|([^>]+)>`)
	mdTagRe     = regexp.MustCompile(`<[^>]+>`)
	mdBraceRe   = regexp.MustCompile(`\{[^}]+\|([^}]+)\}`)
	itemLineRe  = regexp.MustCompile(`(?i)^(\d+)\s*[x×]\s*(.+)$`)
	rupeeRe     = regexp.MustCompile(`₹?\s*([\d,.]+)`)
)

type OrderLine struct {
	Name       string `json:"name"`
	Qty        int    `json:"qty"`
	PriceCents int    `json:"price_cents,omitempty"`
}

type FetchedOrder struct {
	ExternalOrderID string      `json:"external_order_id"`
	ResID           string      `json:"res_id,omitempty"`
	Lines           []OrderLine `json:"lines"`
	TotalCents      int         `json:"total_cents,omitempty"`
	PlacedAt        string      `json:"placed_at,omitempty"`
}

type historySnippet struct {
	ID           json.RawMessage `json:"id"`
	TopRightText *textBlock      `json:"topRightText"`
	InfoList     []infoRow       `json:"infoList"`
}

type textBlock struct {
	Text string `json:"text"`
}

type infoRow struct {
	LeftText  *textBlock `json:"leftText"`
	RightText *textBlock `json:"rightText"`
}

type historyResponse struct {
	HasMore                       bool             `json:"hasMore"`
	PostbackParams                json.RawMessage  `json:"postbackParams"`
	Snippets                      []historySnippet `json:"snippets"`
	OrderHistoryUnavailableConfig *struct {
		Title string `json:"title"`
	} `json:"orderHistoryUnavailableConfig"`
}

type orderDetailsResponse struct {
	Order *struct {
		ID          string `json:"id"`
		CreatedAt   string `json:"createdAt"`
		ResID       string `json:"resId"`
		CartDetails *struct {
			Items *struct {
				Dishes []struct {
					Name      string  `json:"name"`
					Quantity  float64 `json:"quantity"`
					TotalCost float64 `json:"totalCost"`
				} `json:"dishes"`
			} `json:"items"`
			Total *struct {
				AmountDetails *struct {
					TotalCost       float64 `json:"totalCost"`
					AmountTotalCost float64 `json:"amountTotalCost"`
				} `json:"amountDetails"`
			} `json:"total"`
		} `json:"cartDetails"`
	} `json:"order"`
}

func stripMarkdown(text string) string {
	text = mdInlineRe.ReplaceAllString(text, "$1")
	text = mdTagRe.ReplaceAllString(text, "")
	text = mdBraceRe.ReplaceAllString(text, "$1")
	return strings.TrimSpace(text)
}

func parseRupeeCents(text string) (int, bool) {
	m := rupeeRe.FindStringSubmatch(stripMarkdown(text))
	if len(m) < 2 {
		return 0, false
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", ""), 64)
	if err != nil {
		return 0, false
	}
	return int(v * 100), true
}

func parseItemSummary(text string) []OrderLine {
	var lines []OrderLine
	for _, part := range strings.Split(stripMarkdown(text), ",") {
		m := itemLineRe.FindStringSubmatch(strings.TrimSpace(part))
		if len(m) < 3 {
			continue
		}
		qty, _ := strconv.Atoi(m[1])
		name := strings.TrimSpace(m[2])
		if qty > 0 && name != "" {
			lines = append(lines, OrderLine{Name: name, Qty: qty})
		}
	}
	return lines
}

func snippetID(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		return strings.TrimSpace(n.String())
	}
	return strings.Trim(strings.TrimSpace(string(raw)), `"`)
}

func parseHistorySnippet(snippet historySnippet) *FetchedOrder {
	orderID := snippetID(snippet.ID)
	if orderID == "" {
		return nil
	}
	var placedAt string
	var summaryLines []OrderLine
	var totalCents int
	hasTotal := false

	for _, row := range snippet.InfoList {
		left := stripMarkdown(textValue(row.LeftText))
		right := stripMarkdown(textValue(row.RightText))
		if matched, _ := regexp.MatchString(`^\d{1,2}:\d{2}`, left); matched || strings.Contains(left, "|") {
			placedAt = left
		}
		if itemLineRe.MatchString(left) {
			summaryLines = append(summaryLines, parseItemSummary(left)...)
		}
		if itemLineRe.MatchString(right) {
			summaryLines = append(summaryLines, parseItemSummary(right)...)
		}
		if strings.HasPrefix(right, "₹") {
			if cents, ok := parseRupeeCents(right); ok {
				totalCents = cents
				hasTotal = true
			}
		}
	}
	if placedAt == "" && snippet.TopRightText != nil {
		placedAt = stripMarkdown(snippet.TopRightText.Text)
	}
	o := &FetchedOrder{
		ExternalOrderID: orderID,
		PlacedAt:        placedAt,
		Lines:           summaryLines,
	}
	if hasTotal {
		o.TotalCents = totalCents
	}
	return o
}

func textValue(t *textBlock) string {
	if t == nil {
		return ""
	}
	return t.Text
}

func istLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return time.FixedZone("IST", 5*3600+30*60)
	}
	return loc
}

func formatDateRange(daysBack int) string {
	end := time.Now().In(istLocation())
	start := end.AddDate(0, 0, -daysBack)
	fmtDate := func(t time.Time) string { return t.Format("2006-01-02") }
	return fmtDate(start) + "," + fmtDate(end)
}

// formatRollingDateRange returns an IST date range matching the merchant dashboard default:
// yesterday through tomorrow (e.g. "2026-06-05,2026-06-07" when today is 6 June).
func formatRollingDateRange(daysBefore, daysAfter int) string {
	now := time.Now().In(istLocation())
	fmtDate := func(t time.Time) string { return t.Format("2006-01-02") }
	start := now.AddDate(0, 0, -daysBefore)
	end := now.AddDate(0, 0, daysAfter)
	return fmtDate(start) + "," + fmtDate(end)
}

// historyCreatedAtParam returns the created_at field for get-all-v2.
// Paginated requests reuse the same range; the merchant dashboard uses a tight
// yesterday–tomorrow IST window with get_filters on the first page.
func historyCreatedAtParam(daysBack int) string {
	if daysBack <= 0 {
		return formatRollingDateRange(1, 1)
	}
	// Wider backfill window: still cap forward edge at tomorrow so recent orders are included.
	return formatRollingDateRange(daysBack, 1)
}

// postbackParamForRequest normalizes postbackParams from the API into the string form
// expected on the next history request (handles object or JSON-string values).
func postbackParamForRequest(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	if raw[0] == '"' {
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			return s
		}
	}
	return string(raw)
}

func maxOrdersPerSync() int {
	if v := strings.TrimSpace(os.Getenv("ZOMATO_MAX_ORDERS_PER_SYNC")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultMaxOrders
}

func (s *Service) listOrderHistory(ctx context.Context, auth *Auth, outletID string, limit, daysBack int, postbackParams string) ([]*FetchedOrder, bool, string, error) {
	body, _ := json.Marshal(map[string]any{
		"res_Id":          outletID,
		"limit":           limit,
		"order_type":      "",
		"created_at":      historyCreatedAtParam(daysBack),
		"postback_params": postbackParams,
		"state":           "",
		"rating":          "",
		"get_filters":     postbackParams == "",
	})
	resp, err := auth.do(ctx, s.httpClient, http.MethodPost, historyURL, body)
	if err != nil {
		return nil, false, "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, false, "", fmt.Errorf("order history failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var data historyResponse
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, false, "", err
	}
	if data.OrderHistoryUnavailableConfig != nil && data.OrderHistoryUnavailableConfig.Title != "" {
		return nil, false, "", fmt.Errorf("order history unavailable: %s", data.OrderHistoryUnavailableConfig.Title)
	}
	var orders []*FetchedOrder
	for _, snippet := range data.Snippets {
		if o := parseHistorySnippet(snippet); o != nil {
			orders = append(orders, o)
		}
	}
	return orders, data.HasMore, postbackParamForRequest(data.PostbackParams), nil
}

func (s *Service) getOrderDetails(ctx context.Context, auth *Auth, orderID string) (*FetchedOrder, error) {
	if o, err := s.getOrderDetailsFromMerchantAPI(ctx, auth, orderID); err == nil && o != nil {
		return o, nil
	}
	return s.getOrderDetailsFromGateway(ctx, auth, orderID)
}

func (s *Service) getOrderDetailsFromMerchantAPI(ctx context.Context, auth *Auth, orderID string) (*FetchedOrder, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	url := orderDetailsURL + "?tab_id=" + orderID
	resp, err := auth.do(ctx, s.httpClient, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return parseOrderDetailsResponse(resp, orderID)
}

func (s *Service) getOrderDetailsFromGateway(ctx context.Context, auth *Auth, orderID string) (*FetchedOrder, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	body, _ := json.Marshal(map[string]any{"tab_id": orderID})
	resp, err := auth.do(ctx, s.httpClient, http.MethodPost, orderDetailsGWURL, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return parseOrderDetailsResponse(resp, orderID)
}

func parseOrderDetailsResponse(resp *http.Response, orderID string) (*FetchedOrder, error) {
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("order details failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var data orderDetailsResponse
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	if data.Order == nil || data.Order.ID == "" {
		return nil, nil
	}
	var lines []OrderLine
	var dishes []struct {
		Name      string  `json:"name"`
		Quantity  float64 `json:"quantity"`
		TotalCost float64 `json:"totalCost"`
	}
	if data.Order.CartDetails != nil && data.Order.CartDetails.Items != nil {
		dishes = data.Order.CartDetails.Items.Dishes
	}
	for _, dish := range dishes {
		name := strings.TrimSpace(dish.Name)
		qty := int(dish.Quantity)
		if qty <= 0 {
			qty = 1
		}
		if name == "" || qty <= 0 {
			continue
		}
		line := OrderLine{Name: name, Qty: qty}
		if dish.TotalCost > 0 {
			line.PriceCents = int(dish.TotalCost * 100)
		}
		lines = append(lines, line)
	}
	totalRaw := 0.0
	if data.Order.CartDetails != nil && data.Order.CartDetails.Total != nil && data.Order.CartDetails.Total.AmountDetails != nil {
		ad := data.Order.CartDetails.Total.AmountDetails
		if ad.AmountTotalCost > 0 {
			totalRaw = ad.AmountTotalCost
		} else {
			totalRaw = ad.TotalCost
		}
	}
	o := &FetchedOrder{
		ExternalOrderID: data.Order.ID,
		ResID:           data.Order.ResID,
		Lines:           lines,
		PlacedAt:        data.Order.CreatedAt,
	}
	if totalRaw > 0 {
		o.TotalCents = int(totalRaw * 100)
	}
	return o, nil
}

func (s *Service) verifyAuth(ctx context.Context, auth *Auth, outletID string) error {
	if _, err := auth.ensureCSRF(ctx, s.httpClient); err != nil {
		return err
	}
	if strings.TrimSpace(outletID) == "" {
		return nil
	}
	_, _, _, err := s.listOrderHistory(ctx, auth, outletID, 1, 1, "")
	return err
}

func maxHistoryDaysBack() int {
	if v := strings.TrimSpace(os.Getenv("ZOMATO_HISTORY_DAYS_BACK")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultDaysBack
}

func mergeFetchedOrder(partial *FetchedOrder, detailed *FetchedOrder) FetchedOrder {
	merged := *partial
	if detailed != nil {
		if len(detailed.Lines) > 0 {
			merged.Lines = detailed.Lines
		}
		if detailed.PlacedAt != "" {
			merged.PlacedAt = detailed.PlacedAt
		}
		if detailed.TotalCents > 0 {
			merged.TotalCents = detailed.TotalCents
		}
	}
	if len(merged.Lines) == 0 {
		merged.Lines = []OrderLine{{Name: "Zomato order", Qty: 1}}
	}
	return merged
}

func pollOrdersLimit() int {
	if v := strings.TrimSpace(os.Getenv("ZOMATO_POLL_ORDERS_LIMIT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultPollOrders
}

func pollDaysBack() int {
	if v := strings.TrimSpace(os.Getenv("ZOMATO_POLL_DAYS_BACK")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return defaultPollDaysBack
}

func (s *Service) loadKnownExternalIDs(ctx context.Context, kitchenID string) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT external_order_id FROM zomato_external_orders WHERE kitchen_id = $1
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	known := map[string]struct{}{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		known[strings.TrimSpace(id)] = struct{}{}
	}
	return known, rows.Err()
}

func (s *Service) enrichPartials(ctx context.Context, auth *Auth, partials []*FetchedOrder, known map[string]struct{}) ([]FetchedOrder, error) {
	orders := make([]FetchedOrder, 0, len(partials))
	seen := map[string]struct{}{}
	for _, partial := range partials {
		if partial == nil || partial.ExternalOrderID == "" {
			continue
		}
		if _, ok := seen[partial.ExternalOrderID]; ok {
			continue
		}
		seen[partial.ExternalOrderID] = struct{}{}
		if _, exists := known[partial.ExternalOrderID]; exists {
			continue
		}
		detailed, _ := s.getOrderDetails(ctx, auth, partial.ExternalOrderID)
		orders = append(orders, mergeFetchedOrder(partial, detailed))
	}
	return orders, nil
}

// fetchRecentOrdersForPoll loads recent history and imports via order-details for orders
// missing from our DB. Some delivered orders appear in order-details before history list API.
func (s *Service) fetchRecentOrdersForPoll(ctx context.Context, auth *Auth, kitchenID, outletID string) ([]FetchedOrder, int, error) {
	if strings.TrimSpace(outletID) == "" {
		return nil, 0, fmt.Errorf("outlet_id required for API sync")
	}
	if _, err := auth.ensureCSRF(ctx, s.httpClient); err != nil {
		return nil, 0, err
	}
	limit := pollOrdersLimit()
	daysBack := pollDaysBack()
	if daysBack < 1 {
		daysBack = 1
	}

	known, err := s.loadKnownExternalIDs(ctx, kitchenID)
	if err != nil {
		return nil, 0, err
	}

	collected := make([]*FetchedOrder, 0, limit)
	postbackParams := ""
	checked := 0
	for len(collected) < limit {
		pageLimit := 10
		if limit-len(collected) < pageLimit {
			pageLimit = limit - len(collected)
		}
		page, hasMore, nextPostback, err := s.listOrderHistory(ctx, auth, outletID, pageLimit, daysBack, postbackParams)
		if err != nil {
			return nil, checked, err
		}
		checked += len(page)
		collected = append(collected, page...)
		if !hasMore || nextPostback == "" || len(page) == 0 {
			break
		}
		postbackParams = nextPostback
	}

	orders, err := s.enrichPartials(ctx, auth, collected, known)
	return orders, checked, err
}

// fetchOrdersDeep paginates order history for initial backfill.
func (s *Service) fetchOrdersDeep(ctx context.Context, auth *Auth, kitchenID, outletID string) ([]FetchedOrder, int, error) {
	if strings.TrimSpace(outletID) == "" {
		return nil, 0, fmt.Errorf("outlet_id required for API sync")
	}
	if _, err := auth.ensureCSRF(ctx, s.httpClient); err != nil {
		return nil, 0, err
	}

	maxOrders := maxOrdersPerSync()
	daysBack := maxHistoryDaysBack()
	collected := make([]*FetchedOrder, 0, maxOrders)
	postbackParams := ""
	pages := 0

	for len(collected) < maxOrders && pages < 5 {
		limit := 10
		if maxOrders-len(collected) < limit {
			limit = maxOrders - len(collected)
		}
		page, hasMore, nextPostback, err := s.listOrderHistory(ctx, auth, outletID, limit, daysBack, postbackParams)
		if err != nil {
			return nil, len(collected), err
		}
		collected = append(collected, page...)
		if !hasMore || nextPostback == "" {
			break
		}
		postbackParams = nextPostback
		pages++
	}

	known, err := s.loadKnownExternalIDs(ctx, kitchenID)
	if err != nil {
		return nil, len(collected), err
	}
	orders, err := s.enrichPartials(ctx, auth, collected, known)
	return orders, len(collected), err
}

func fetchedToIngest(orders []FetchedOrder) []IngestOrder {
	out := make([]IngestOrder, 0, len(orders))
	for _, o := range orders {
		lines := make([]IngestLine, 0, len(o.Lines))
		for _, ln := range o.Lines {
			lines = append(lines, IngestLine{Name: ln.Name, Qty: ln.Qty, Price: ln.PriceCents})
		}
		out = append(out, IngestOrder{
			ExternalOrderID: o.ExternalOrderID,
			Lines:           lines,
			TotalCents:      o.TotalCents,
			PlacedAt:        o.PlacedAt,
		})
	}
	return out
}
