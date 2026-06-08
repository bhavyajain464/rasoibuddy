//go:build integration

package zomato

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"

	restsvc "kitchenai-backend/internal/restaurant/services"
)

func TestFetchContentMenuIntegration(t *testing.T) {
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
	if outletID == "" {
		outletID = "22267610"
	}
	auth, err := ParseAuth(authJSON)
	if err != nil {
		t.Fatal(err)
	}

	svc := &Service{httpClient: &http.Client{Timeout: 60 * time.Second}}
	ctx := context.Background()
	raw, err := svc.fetchContentMenu(ctx, auth, outletID)
	if err != nil {
		t.Fatal(err)
	}
	dishes, err := restsvc.ParseZomatoMenuJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(dishes) < 10 {
		t.Fatalf("expected many dishes, got %d", len(dishes))
	}
	t.Logf("outlet=%s dishes=%d sample=%s (%s)", outletID, len(dishes), dishes[0].Name, dishes[0].Category)

	var envelope menuContentResponse
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	if !envelope.Success {
		t.Fatalf("success=false message=%s", envelope.Message)
	}
}
