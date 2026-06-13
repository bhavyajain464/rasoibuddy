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
//	COMMERCE_ENABLED_PARTNERS=blinkit,zepto  (optional whitelist; order preserved)
//	COMMERCE_MAX_PARTNERS=2  (optional cap after whitelist/disable filtering; 0 = no cap)
//	COMMERCE_DISABLED_PARTNERS=zepto,jiomart  (comma list to hide specific partners)
//	COMMERCE_AFFILIATE_<ID>=<template with {target} and {subid}>  (turns on commission)
func loadCommerceConfig() CommerceConfig {
	enabled := getEnvBool("COMMERCE_ENABLED", false)
	if !enabled {
		return CommerceConfig{Enabled: false, Partners: nil}
	}

	disabled := map[string]bool{}
	for _, p := range strings.Split(getEnv("COMMERCE_DISABLED_PARTNERS", ""), ",") {
		if s := strings.ToLower(strings.TrimSpace(p)); s != "" {
			disabled[s] = true
		}
	}

	whitelist := parseCommercePartnerIDs(getEnv("COMMERCE_ENABLED_PARTNERS", ""))
	maxPartners := getEnvInt("COMMERCE_MAX_PARTNERS", 0)

	byID := map[string]CommercePartner{}
	for _, p := range defaultCommercePartners() {
		byID[p.ID] = p
	}

	var partners []CommercePartner
	appendPartner := func(id string) {
		p, ok := byID[id]
		if !ok || disabled[id] {
			return
		}
		p.AffiliateTemplate = strings.TrimSpace(os.Getenv("COMMERCE_AFFILIATE_" + strings.ToUpper(p.ID)))
		partners = append(partners, p)
	}

	if len(whitelist) > 0 {
		for _, id := range whitelist {
			appendPartner(id)
		}
	} else {
		for _, p := range defaultCommercePartners() {
			appendPartner(p.ID)
		}
	}

	if maxPartners > 0 && len(partners) > maxPartners {
		partners = partners[:maxPartners]
	}

	if len(partners) == 0 {
		enabled = false
	}

	return CommerceConfig{Enabled: enabled, Partners: partners}
}

func parseCommercePartnerIDs(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		id := strings.ToLower(strings.TrimSpace(part))
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
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
