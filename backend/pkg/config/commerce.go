package config

import (
	"os"
	"strings"
)

// CommercePartner is a grocery / quick-commerce destination for the "order this list" flow.
// DeepLink/SearchURL open the partner app or web; AffiliateTemplate (when set) wraps the
// target URL for commission tracking. Phase 0 ships with AffiliateTemplate blank — the
// links are plain (free, no partnership) and turn into earning links via env when you
// join a free affiliate network (EarnKaro / Cuelinks / Amazon Associates, etc.).
type CommercePartner struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	LogoURL           string `json:"logo_url,omitempty"`
	ETA               string `json:"eta,omitempty"`
	DeepLink          string `json:"-"` // app/home entry URL
	SearchURL         string `json:"-"` // contains {query} placeholder
	AffiliateTemplate string `json:"-"` // contains {target} and {subid}; blank => direct link
}

// CommerceConfig controls the Phase 0 grocery-ordering surface.
type CommerceConfig struct {
	Enabled  bool
	Partners []CommercePartner
}

// defaultCommercePartners are the built-in Indian quick-commerce / grocery destinations.
// Search URLs are public web links that hand off to the native app on mobile.
func defaultCommercePartners() []CommercePartner {
	return []CommercePartner{
		{ID: "blinkit", Name: "Blinkit", ETA: "10-20 min", DeepLink: "https://blinkit.com/", SearchURL: "https://blinkit.com/s/?q={query}"},
		{ID: "zepto", Name: "Zepto", ETA: "10-20 min", DeepLink: "https://www.zeptonow.com/", SearchURL: "https://www.zeptonow.com/search?query={query}"},
		{ID: "instamart", Name: "Swiggy Instamart", ETA: "15-30 min", DeepLink: "https://www.swiggy.com/instamart", SearchURL: "https://www.swiggy.com/instamart/search?custom_back=true&query={query}"},
		{ID: "bigbasket", Name: "BigBasket", ETA: "Same day", DeepLink: "https://www.bigbasket.com/", SearchURL: "https://www.bigbasket.com/ps/?q={query}"},
		{ID: "jiomart", Name: "JioMart", ETA: "Same day", DeepLink: "https://www.jiomart.com/", SearchURL: "https://www.jiomart.com/search/{query}"},
	}
}

// loadCommerceConfig builds the partner list and applies optional env overrides:
//
//	COMMERCE_ENABLED=true|false  (default false — surface hidden client-side)
//	COMMERCE_DISABLED_PARTNERS=zepto,jiomart  (comma list to hide specific partners)
//	COMMERCE_AFFILIATE_<ID>=<template with {target} and {subid}>  (turns on commission)
func loadCommerceConfig() CommerceConfig {
	enabled := getEnvBool("COMMERCE_ENABLED", false)

	disabled := map[string]bool{}
	for _, p := range strings.Split(getEnv("COMMERCE_DISABLED_PARTNERS", ""), ",") {
		if s := strings.ToLower(strings.TrimSpace(p)); s != "" {
			disabled[s] = true
		}
	}

	var partners []CommercePartner
	for _, p := range defaultCommercePartners() {
		if disabled[p.ID] {
			continue
		}
		// Per-partner affiliate template, e.g. COMMERCE_AFFILIATE_BLINKIT.
		p.AffiliateTemplate = strings.TrimSpace(os.Getenv("COMMERCE_AFFILIATE_" + strings.ToUpper(p.ID)))
		partners = append(partners, p)
	}
	return CommerceConfig{Enabled: enabled, Partners: partners}
}

// FindPartner returns a configured partner by id.
func (c CommerceConfig) FindPartner(id string) (CommercePartner, bool) {
	id = strings.ToLower(strings.TrimSpace(id))
	for _, p := range c.Partners {
		if p.ID == id {
			return p, true
		}
	}
	return CommercePartner{}, false
}
