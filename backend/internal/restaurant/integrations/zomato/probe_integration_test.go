//go:build integration

package zomato

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

func TestProbeOrderEndpoints(t *testing.T) {
	kitchenID := os.Getenv("ZOMATO_PROBE_KITCHEN")
	if kitchenID == "" {
		kitchenID = "12ca918f-2297-4ff0-9da8-50466d2bf767"
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Fatal("DATABASE_URL required")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var authJSON []byte
	var outletID string
	err = db.QueryRow(`
		SELECT a.auth_json, COALESCE(o.partner_outlet_id, '')
		FROM zomato_kitchen_auth a
		LEFT JOIN partner_order_sync o ON o.kitchen_id = a.kitchen_id
		WHERE a.kitchen_id = $1
		ORDER BY o.updated_at DESC NULLS LAST
		LIMIT 1
	`, kitchenID).Scan(&authJSON, &outletID)
	if err != nil {
		t.Fatal(err)
	}
	auth, err := ParseAuth(authJSON)
	if err != nil {
		t.Fatal(err)
	}
	svc := &Service{httpClient: &http.Client{Timeout: 60 * time.Second}}
	ctx := context.Background()
	if _, err := auth.ensureCSRF(ctx, svc.httpClient); err != nil {
		t.Fatal(err)
	}

	page, _, _, err := svc.listOrderHistory(ctx, auth, outletID, 10, 1, "")
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	t.Logf("history today: %d orders", len(page))
	for _, o := range page {
		if o != nil {
			t.Logf("  id=%s placed=%s", o.ExternalOrderID, o.PlacedAt)
		}
	}

	// Tab config may reveal live order API paths.
	for _, tabID := range []string{"1", "2", "3", "orders", "order", "live", "active"} {
		url := "https://api.zomato.com/merchant-gw/web/get-user-tab-config?tabId=" + tabID
		resp, err := auth.do(ctx, svc.httpClient, http.MethodGet, url, nil)
		if err != nil {
			t.Logf("tabConfig %s ERR: %v", tabID, err)
			continue
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			t.Logf("tabConfig %s status=%d %s", tabID, resp.StatusCode, truncate(string(raw), 200))
			continue
		}
		t.Logf("tabConfig %s: %s", tabID, truncate(string(raw), 800))
	}

	candidates := []struct {
		method string
		url    string
		body   map[string]any
	}{
		{"POST", "https://api.zomato.com/merchant-gw/web/order/home/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/incoming/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/new/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/dashboard/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/preparing/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/running/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/get-all-active-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/get-active-orders-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/get-state-v2", map[string]any{"res_Id": outletID}},
		{"POST", "https://api.zomato.com/merchant-gw/web/order/tab/get-all-v2", map[string]any{"res_Id": outletID, "tab_id": "active", "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/o2/order/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", "https://api.zomato.com/merchant-gw/web/online-ordering/order/get-all-v2", map[string]any{"res_Id": outletID, "limit": 20}},
		{"POST", historyURL, map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "preparing",
			"created_at": formatDateRange(1), "postback_params": "",
			"state": "preparing", "rating": "", "get_filters": false,
		}},
		{"GET", "https://www.zomato.com/merchant-api/orders/list?res_id=" + outletID, nil},
		{"GET", "https://www.zomato.com/merchant-api/orders/get-all?res_id=" + outletID, nil},
		{"GET", "https://www.zomato.com/merchant-api/orders/active-orders?res_id=" + outletID, nil},
		{"GET", "https://www.zomato.com/merchant-api/orders/new-orders?res_id=" + outletID, nil},
		{"POST", "https://www.zomato.com/merchant-api/orders/get-all", map[string]any{"res_id": outletID}},
	}
	for _, c := range candidates {
		var body []byte
		if c.body != nil {
			body, _ = json.Marshal(c.body)
		}
		resp, err := auth.do(ctx, svc.httpClient, c.method, c.url, body)
		if err != nil {
			t.Logf("%s %s ERR: %v", c.method, c.url, err)
			continue
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Logf("%s %s status=%d len=%d", c.method, c.url, resp.StatusCode, len(raw))
		if resp.StatusCode >= 300 {
			t.Logf("  body: %s", truncate(string(raw), 300))
			continue
		}
		var data historyResponse
		if json.Unmarshal(raw, &data) == nil && len(data.Snippets) > 0 {
			t.Logf("  snippets=%d hasMore=%v", len(data.Snippets), data.HasMore)
			for _, sn := range data.Snippets {
				t.Logf("    id=%s", snippetID(sn.ID))
			}
		} else if strings.Contains(string(raw), "order") {
			t.Logf("  body: %s", truncate(string(raw), 500))
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func formatDateRangeProbe(daysBack int) string {
	end := time.Now().UTC()
	start := end.AddDate(0, 0, -daysBack)
	fmtDate := func(t time.Time) string { return t.Format("2006-01-02") }
	return fmtDate(start) + "," + fmtDate(end)
}
