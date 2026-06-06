package zomato

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestMergeFetchedOrderFallbackLine(t *testing.T) {
	partial := &FetchedOrder{ExternalOrderID: "99", Lines: nil}
	merged := mergeFetchedOrder(partial, nil)
	if len(merged.Lines) != 1 || merged.Lines[0].Name != "Zomato order" {
		t.Fatalf("lines=%+v", merged.Lines)
	}
}

func TestParseHistorySnippet(t *testing.T) {
	raw := `{
		"id": "12345",
		"topRightText": {"text": "12:30 PM"},
		"infoList": [
			{"leftText": {"text": "2 x Paneer Tikka"}, "rightText": {"text": "₹450"}},
			{"leftText": {"text": "01:15 PM | Today"}, "rightText": {"text": ""}}
		]
	}`
	var snippet historySnippet
	if err := json.Unmarshal([]byte(raw), &snippet); err != nil {
		t.Fatal(err)
	}
	o := parseHistorySnippet(snippet)
	if o == nil {
		t.Fatal("expected order")
	}
	if o.ExternalOrderID != "12345" {
		t.Fatalf("id=%q", o.ExternalOrderID)
	}
	if len(o.Lines) != 1 || o.Lines[0].Name != "Paneer Tikka" || o.Lines[0].Qty != 2 {
		t.Fatalf("lines=%+v", o.Lines)
	}
	if o.TotalCents != 45000 {
		t.Fatalf("total=%d", o.TotalCents)
	}
}

func TestPostbackParamForRequest(t *testing.T) {
	raw := json.RawMessage(`"{\"last_order_id\":7621441126}"`)
	got := postbackParamForRequest(raw)
	if got != `{"last_order_id":7621441126}` {
		t.Fatalf("got=%q", got)
	}
	obj := json.RawMessage(`{"last_order_id":7621441126}`)
	got = postbackParamForRequest(obj)
	if got != `{"last_order_id":7621441126}` {
		t.Fatalf("object got=%q", got)
	}
}

func TestParseZomatoPlacedAt(t *testing.T) {
	if parsed := parseZomatoPlacedAt("2026-06-05T10:30:00Z"); parsed == nil || parsed.Format(time.RFC3339) != "2026-06-05T10:30:00Z" {
		t.Fatalf("rfc3339=%v", parsed)
	}
	if parsed := parseZomatoPlacedAt("5 June"); parsed == nil {
		t.Fatal("expected day month parse")
	}
	if parsed := parseZomatoPlacedAt("1 June"); parsed == nil {
		t.Fatal("expected 1 June parse")
	}
	loc := istLocation()
	if parsed := parseZomatoPlacedAt("6:34 PM | 6 June"); parsed == nil {
		t.Fatal("expected time day month parse")
	} else {
		inIST := parsed.In(loc)
		if inIST.Day() != 6 || inIST.Month() != time.June || inIST.Hour() != 18 || inIST.Minute() != 34 {
			t.Fatalf("time day month got %v", inIST)
		}
	}
}

func TestHistoryCreatedAtParamRolling(t *testing.T) {
	got := historyCreatedAtParam(0)
	parts := strings.Split(got, ",")
	if len(parts) != 2 {
		t.Fatalf("expected start,end got %q", got)
	}
	loc := istLocation()
	today := time.Now().In(loc)
	yesterday := today.AddDate(0, 0, -1).Format("2006-01-02")
	tomorrow := today.AddDate(0, 0, 1).Format("2006-01-02")
	if parts[0] != yesterday || parts[1] != tomorrow {
		t.Fatalf("got %q want %s,%s", got, yesterday, tomorrow)
	}
}

func TestParseAuthCookieArray(t *testing.T) {
	raw := `[{"name":"a","value":"b"}]`
	auth, err := ParseAuth([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(auth.Cookies) != 1 || auth.Cookies[0].Name != "a" {
		t.Fatalf("cookies=%+v", auth.Cookies)
	}
}
