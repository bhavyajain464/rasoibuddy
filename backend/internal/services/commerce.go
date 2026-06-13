package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"

	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/units"
)

// OrderLinkItem is one line of the grocery order (household shopping list / suggestions).
type OrderLinkItem struct {
	Name string  `json:"name"`
	Qty  float64 `json:"qty"`
	Unit string  `json:"unit"`
}

// BuildOrderLink returns (a) the URL to open for a partner and (b) a copy/paste friendly
// list. Phase 0 (no affiliate template) returns a plain deep/search link. When a partner
// has an AffiliateTemplate ({target},{subid}), the link is wrapped for commission tracking
// — no other code changes needed to start earning.
func BuildOrderLink(p config.CommercePartner, items []OrderLinkItem, trackingID string) (string, string) {
	target := strings.TrimSpace(p.DeepLink)
	// Most quick-commerce search URLs accept a single query term; use the first item.
	if p.SearchURL != "" && len(items) > 0 {
		if q := strings.TrimSpace(items[0].Name); q != "" {
			target = strings.ReplaceAll(p.SearchURL, "{query}", url.QueryEscape(q))
		}
	}
	final := target
	if tmpl := strings.TrimSpace(p.AffiliateTemplate); tmpl != "" {
		final = strings.ReplaceAll(tmpl, "{target}", url.QueryEscape(target))
		final = strings.ReplaceAll(final, "{subid}", url.QueryEscape(trackingID))
	}
	return final, BuildOrderCopyText(items)
}

// BuildOrderCopyText renders "2 kg Onion\n1 L Milk" for clipboard fallback.
func BuildOrderCopyText(items []OrderLinkItem) string {
	var b strings.Builder
	for _, it := range items {
		name := strings.TrimSpace(it.Name)
		if name == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		unit := ""
		if strings.TrimSpace(it.Unit) != "" {
			unit = units.Normalize(it.Unit)
		}
		switch {
		case it.Qty > 0 && unit != "":
			b.WriteString(fmt.Sprintf("%s %s %s", trimFloat(it.Qty), unit, name))
		case it.Qty > 0:
			b.WriteString(fmt.Sprintf("%s %s", trimFloat(it.Qty), name))
		default:
			b.WriteString(name)
		}
	}
	return b.String()
}

func trimFloat(f float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", f), "0"), ".")
}

// NewCommerceTrackingID returns a unique affiliate subid for one order intent.
func NewCommerceTrackingID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Extremely unlikely; fall back to a fixed-length placeholder.
		return "tid000000000000000000000000"
	}
	return "tid" + hex.EncodeToString(b[:])
}
