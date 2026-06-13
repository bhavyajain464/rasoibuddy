package zomato

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDoMenuEditor(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("action") != "get_content_menu" {
			t.Fatalf("unexpected action: %s", r.URL.Query().Get("action"))
		}
		if r.URL.Query().Get("res_id") != "22267610" {
			t.Fatalf("unexpected res_id: %s", r.URL.Query().Get("res_id"))
		}
		if got := r.Header.Get("Referer"); got != "https://www.zomato.com/partners/onlineordering/menu/editor?resId=22267610" {
			t.Fatalf("referer=%q", got)
		}
		if r.Header.Get("Cookie") == "" {
			t.Fatal("expected cookie header")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"message": "Success",
			"data": map[string]any{
				"menuResponse": map[string]any{
					"categoryWrappers": []map[string]any{
						{
							"category": map[string]any{"name": "Thali"},
							"subCategoryWrappers": []map[string]any{
								{
									"subCategoryEntities": []map[string]any{
										{"entityType": "catalogue", "entityId": "750820921"},
									},
								},
							},
						},
					},
					"catalogueWrappers": []map[string]any{
						{
							"catalogue": map[string]any{
								"catalogueId": "750820921",
								"name":        "Standard Thali",
							},
							"variantWrappers": []map[string]any{
								{
									"variantPrices": []map[string]any{
										{"service": "delivery", "price": 221.0, "isVisible": true},
									},
								},
							},
						},
					},
				},
			},
		})
	}))
	defer srv.Close()

	auth, err := ParseAuth([]byte(`[{"name":"session","value":"abc"}]`))
	if err != nil {
		t.Fatal(err)
	}
	svc := &Service{httpClient: srv.Client()}
	ctx := context.Background()

	u := srv.URL + "?action=get_content_menu&res_id=22267610&service_role=DELIVERY_TAKEAWAY"
	resp, err := auth.doMenuEditor(ctx, svc.httpClient, http.MethodGet, u, "22267610", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
}

func TestParseMenuContentBodyLoginRequired(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"success": false,
		"message": "Please login to continue",
	})
	_, err := parseMenuContentBody(raw, "22267610")
	if err == nil {
		t.Fatal("expected error")
	}
	if _, ok := err.(*AuthError); !ok {
		t.Fatalf("expected AuthError, got %T: %v", err, err)
	}
}
