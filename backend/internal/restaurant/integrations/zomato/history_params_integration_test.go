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
	"strings"
	"testing"

	_ "github.com/lib/pq"
)

func TestHistoryRequestVariants(t *testing.T) {
	const target = "8207761308"
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var authJSON []byte
	var outletID string
	if err := db.QueryRow(`
		SELECT auth_json, COALESCE(outlet_id,'')
		FROM zomato_kitchen_sync WHERE kitchen_id = '12ca918f-2297-4ff0-9da8-50466d2bf767'
	`).Scan(&authJSON, &outletID); err != nil {
		t.Fatal(err)
	}
	auth, err := ParseAuth(authJSON)
	if err != nil {
		t.Fatal(err)
	}
	svc := &Service{httpClient: newZomatoHTTPClient()}
	ctx := context.Background()
	if _, err := auth.ensureCSRF(ctx, svc.httpClient); err != nil {
		t.Fatal(err)
	}

	variants := []struct {
		name string
		body map[string]any
	}{
		{"default", map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "", "created_at": formatDateRange(7),
			"postback_params": "", "state": "", "rating": "", "get_filters": false,
		}},
		{"empty_created_at", map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "", "created_at": "",
			"postback_params": "", "state": "", "rating": "", "get_filters": false,
		}},
		{"orderHistory_postback", map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "", "created_at": formatDateRange(7),
			"postback_params": `{"screen_name":"orderHistory"}`, "state": "", "rating": "", "get_filters": true,
		}},
		{"june6_only", map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "", "created_at": "2026-06-06,2026-06-06",
			"postback_params": "", "state": "", "rating": "", "get_filters": false,
		}},
		{"browser_exact", map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "", "created_at": "2026-06-05,2026-06-07",
			"postback_params": "", "state": "", "rating": "", "get_filters": true,
		}},
		{"rolling_3d_ist", map[string]any{
			"res_Id": outletID, "limit": 10, "order_type": "", "created_at": formatRollingDateRange(1, 1),
			"postback_params": "", "state": "", "rating": "", "get_filters": true,
		}},
	}

	for _, v := range variants {
		rawBody, _ := json.Marshal(v.body)
		resp, err := auth.doHistory(ctx, svc.httpClient, rawBody, v.name == "with_mx_header")
		if err != nil {
			t.Logf("%s ERR: %v", v.name, err)
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var data historyResponse
		if err := json.Unmarshal(body, &data); err != nil {
			t.Logf("%s unmarshal err: %v", v.name, err)
			continue
		}
		maxID, found := int64(0), false
		for _, sn := range data.Snippets {
			id, _ := strconv.ParseInt(snippetID(sn.ID), 10, 64)
			if id > maxID {
				maxID = id
			}
			if snippetID(sn.ID) == target {
				found = true
			}
		}
		t.Logf("%s snippets=%d max=%d found=%v hasMore=%v", v.name, len(data.Snippets), maxID, found, data.HasMore)
	}
}

func (a *Auth) doHistory(ctx context.Context, client *http.Client, body []byte, withMxToken bool) (*http.Response, error) {
	csrf, err := a.ensureCSRF(ctx, client)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, historyURL, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header = a.apiHeaders(csrf)
	if withMxToken {
		for _, c := range a.Cookies {
			if strings.EqualFold(c.Name, "X-Zomato-Mx-Auth-Token") {
				req.Header.Set("X-Zomato-Mx-Auth-Token", c.Value)
				break
			}
		}
	}
	return client.Do(req)
}
