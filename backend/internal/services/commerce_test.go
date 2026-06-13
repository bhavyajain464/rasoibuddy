package services

import (
	"strings"
	"testing"

	"kitchenai-backend/pkg/config"
)

func TestBuildOrderLinkPlain(t *testing.T) {
	p := config.CommercePartner{
		ID: "blinkit", Name: "Blinkit",
		DeepLink:  "https://blinkit.com/",
		SearchURL: "https://blinkit.com/s/?q={query}",
	}
	items := []OrderLinkItem{{Name: "Onion", Qty: 2, Unit: "kg"}, {Name: "Milk", Qty: 1, Unit: "L"}}
	url, copyText := BuildOrderLink(p, items, "tidabc")

	if !strings.Contains(url, "blinkit.com/s/?q=Onion") {
		t.Errorf("expected search link for first item, got %q", url)
	}
	if strings.Contains(url, "tidabc") {
		t.Error("plain (no affiliate) link must not contain the tracking id")
	}
	if copyText != "2 kg Onion\n1 L Milk" {
		t.Errorf("unexpected copy text: %q", copyText)
	}
}

func TestBuildOrderLinkAffiliate(t *testing.T) {
	p := config.CommercePartner{
		ID: "bigbasket", Name: "BigBasket",
		DeepLink:          "https://www.bigbasket.com/",
		SearchURL:         "https://www.bigbasket.com/ps/?q={query}",
		AffiliateTemplate: "https://track.example.com/?url={target}&subid={subid}",
	}
	items := []OrderLinkItem{{Name: "Tomato", Qty: 1, Unit: "kg"}}
	url, _ := BuildOrderLink(p, items, "tidXYZ")

	if !strings.HasPrefix(url, "https://track.example.com/?url=") {
		t.Errorf("affiliate template should wrap the link, got %q", url)
	}
	if !strings.Contains(url, "subid=tidXYZ") {
		t.Errorf("affiliate link must carry the tracking subid, got %q", url)
	}
	if !strings.Contains(url, "bigbasket.com") {
		t.Errorf("wrapped target should be url-encoded inside, got %q", url)
	}
}

func TestBuildOrderCopyText(t *testing.T) {
	got := BuildOrderCopyText([]OrderLinkItem{
		{Name: "Atta", Qty: 5, Unit: "kg"},
		{Name: "Salt", Qty: 0, Unit: ""},
		{Name: "  ", Qty: 1, Unit: "kg"}, // skipped
	})
	if got != "5 kg Atta\nSalt" {
		t.Errorf("unexpected copy text: %q", got)
	}
}

func TestNewCommerceTrackingIDUnique(t *testing.T) {
	a := NewCommerceTrackingID()
	b := NewCommerceTrackingID()
	if a == b {
		t.Error("tracking ids should be unique")
	}
	if !strings.HasPrefix(a, "tid") || len(a) < 10 {
		t.Errorf("unexpected tracking id format: %q", a)
	}
}
