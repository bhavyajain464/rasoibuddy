//go:build integration

package zomato

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"testing"

	_ "github.com/lib/pq"
)

func TestFindOrder8207761308(t *testing.T) {
	const target = "8207761308"
	kitchenID := "12ca918f-2297-4ff0-9da8-50466d2bf767"
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var authJSON []byte
	var outletID string
	if err := db.QueryRow(`
		SELECT a.auth_json, COALESCE(o.partner_outlet_id, '')
		FROM zomato_kitchen_auth a
		LEFT JOIN partner_order_sync o ON o.kitchen_id = a.kitchen_id
		WHERE a.kitchen_id = $1
		ORDER BY o.updated_at DESC NULLS LAST
		LIMIT 1
	`, kitchenID).Scan(&authJSON, &outletID); err != nil {
		t.Fatal(err)
	}
	auth, err := ParseAuth(authJSON)
	if err != nil {
		t.Fatal(err)
	}
	svc := &Service{db: db, httpClient: defaultHTTPClient()}
	ctx := context.Background()
	if _, err := auth.ensureCSRF(ctx, svc.httpClient); err != nil {
		t.Fatal(err)
	}

	// Page 0 stats
	p0, _, _, err := svc.listOrderHistory(ctx, auth, outletID, 20, 7, "")
	if err != nil {
		t.Fatal(err)
	}
	minID, maxID := int64(0), int64(0)
	for i, o := range p0 {
		if o == nil {
			continue
		}
		id, _ := strconv.ParseInt(o.ExternalOrderID, 10, 64)
		if i == 0 || id > maxID {
			maxID = id
		}
		if i == 0 || id < minID {
			minID = id
		}
	}
	t.Logf("page0 (7d): count=%d min=%d max=%d", len(p0), minID, maxID)

	// order details for known + target
	for _, id := range []string{"8204997606", target} {
		d, err := svc.getOrderDetails(ctx, auth, id)
		lines := 0
		placed := ""
		if d != nil {
			lines = len(d.Lines)
			placed = d.PlacedAt
		}
		t.Logf("details %s err=%v lines=%d placed=%s", id, err, lines, placed)
	}

	// gateway-only probe
	body, _ := json.Marshal(map[string]any{"tab_id": target})
	resp, err := auth.do(ctx, svc.httpClient, http.MethodPost, orderDetailsGWURL, body)
	if err != nil {
		t.Logf("gateway details err: %v", err)
	} else {
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Logf("gateway details status=%d body=%s", resp.StatusCode, truncate(string(raw), 400))
	}

	// Scan history pages
	postback := ""
	found := false
	for page := 0; page < 10; page++ {
		orders, hasMore, next, err := svc.listOrderHistory(ctx, auth, outletID, 20, 7, postback)
		if err != nil {
			t.Fatalf("history page %d: %v", page, err)
		}
		t.Logf("page %d: %d snippets hasMore=%v", page, len(orders), hasMore)
		for _, o := range orders {
			if o == nil {
				continue
			}
			if o.ExternalOrderID == target {
				found = true
				t.Logf("FOUND in history page %d placed=%s lines=%d", page, o.PlacedAt, len(o.Lines))
			}
			id, _ := strconv.ParseInt(o.ExternalOrderID, 10, 64)
			if id >= 8207700000 && id <= 8207800000 {
				t.Logf("  nearby id=%s placed=%s", o.ExternalOrderID, o.PlacedAt)
			}
		}
		if found {
			break
		}
		if !hasMore || next == "" {
			break
		}
		postback = next
	}
	if !found {
		t.Log("NOT in history (7 days, up to 10 pages)")
	}

	// Page 1 today
	p1, _, _, _ := svc.listOrderHistory(ctx, auth, outletID, 25, 0, "")
	t.Logf("today page1 count=%d first_id=%s", len(p1), firstID(p1))
	for _, o := range p1 {
		if o != nil && o.ExternalOrderID == target {
			t.Log("FOUND on today page 1")
		}
	}
}

func firstID(orders []*FetchedOrder) string {
	if len(orders) == 0 || orders[0] == nil {
		return "-"
	}
	return orders[0].ExternalOrderID
}

func defaultHTTPClient() *http.Client {
	return newZomatoHTTPClient()
}
