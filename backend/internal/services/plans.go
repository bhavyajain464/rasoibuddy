package services

import (
	"fmt"
	"strings"
	"time"
)

const (
	TierFree  = "free"
	TierPro   = "pro"
	TierElite = "elite"

	IntervalMonthly = "monthly"
	IntervalYearly  = "yearly"

	CurrencyINR = "INR"
)

// PlanProduct is a purchasable (or upcoming) subscription SKU.
type PlanProduct struct {
	Tier                string   `json:"tier"`
	Interval            string   `json:"interval"`
	AmountPaise         int      `json:"amount_paise"`
	Currency            string   `json:"currency"`
	DisplayName         string   `json:"display_name"`
	PriceLabel          string   `json:"price_label"`
	Description         string   `json:"description"`
	Features            []string `json:"features"`
	AvailableForPurchase bool    `json:"available_for_purchase"`
}

// PlanCatalog returns all known plans (Pro purchasable; Elite preview).
func PlanCatalog() []PlanProduct {
	return []PlanProduct{
		{
			Tier: TierPro, Interval: IntervalMonthly, AmountPaise: 9900, Currency: CurrencyINR,
			DisplayName: "Pro", PriceLabel: "₹99/month",
			Description: "Unlimited bill scans",
			Features: []string{
				"Unlimited bill scans",
			},
			AvailableForPurchase: true,
		},
		{
			Tier: TierPro, Interval: IntervalYearly, AmountPaise: 89900, Currency: CurrencyINR,
			DisplayName: "Pro", PriceLabel: "₹899/year",
			Description: "Best value — all Pro features for a year",
			Features: []string{
				"Everything in Pro monthly",
				"Save vs paying monthly",
			},
			AvailableForPurchase: true,
		},
		{
			Tier: TierElite, Interval: IntervalMonthly, AmountPaise: 19900, Currency: CurrencyINR,
			DisplayName: "Elite", PriceLabel: "₹199/month",
			Description: "Pro plus nightly diet digest and nutrition insights",
			Features: []string{
				"Everything in Pro",
				"Nightly diet email from your meal log",
				"AI nutrition insights",
			},
			AvailableForPurchase: true,
		},
		{
			Tier: TierElite, Interval: IntervalYearly, AmountPaise: 199900, Currency: CurrencyINR,
			DisplayName: "Elite", PriceLabel: "₹1,999/year",
			Description: "Best value — all Elite features for a year",
			Features: []string{
				"Everything in Elite monthly",
				"Save vs paying monthly",
			},
			AvailableForPurchase: true,
		},
	}
}

// LookupPlanProduct finds a catalog entry by tier + interval.
func LookupPlanProduct(tier, interval string) (PlanProduct, bool) {
	tier = NormalizeTier(tier)
	interval = NormalizeInterval(interval)
	for _, p := range PlanCatalog() {
		if p.Tier == tier && p.Interval == interval {
			return p, true
		}
	}
	return PlanProduct{}, false
}

func NormalizeTier(tier string) string {
	switch strings.ToLower(strings.TrimSpace(tier)) {
	case TierPro:
		return TierPro
	case TierElite:
		return TierElite
	default:
		return TierFree
	}
}

func NormalizeInterval(interval string) string {
	switch strings.ToLower(strings.TrimSpace(interval)) {
	case IntervalYearly, "annual", "year":
		return IntervalYearly
	case IntervalMonthly, "month":
		return IntervalMonthly
	default:
		return ""
	}
}

// ExtendPlanExpiry stacks billing period onto existing expiry (or from now).
func ExtendPlanExpiry(currentExpires *time.Time, interval string) time.Time {
	base := time.Now().UTC()
	if currentExpires != nil && currentExpires.After(base) {
		base = *currentExpires
	}
	if interval == IntervalYearly {
		return base.AddDate(1, 0, 0)
	}
	return base.AddDate(0, 1, 0)
}

func tierRank(tier string) int {
	switch tier {
	case TierElite:
		return 2
	case TierPro:
		return 1
	default:
		return 0
	}
}

// ResolveUpgradeTier picks the higher tier when extending (elite > pro).
func ResolveUpgradeTier(current, purchased string) string {
	if tierRank(purchased) >= tierRank(current) {
		return purchased
	}
	return current
}

func formatPlanReceipt(tier, interval, shortUser string) string {
	// Razorpay receipt max 40 chars: e.g. pro_m_abc12_1716288000
	t := "p"
	if tier == TierElite {
		t = "e"
	}
	i := "m"
	if interval == IntervalYearly {
		i = "y"
	}
	r := fmt.Sprintf("%s_%s_%s_%d", t, i, shortUser, time.Now().Unix())
	if len(r) > 40 {
		r = r[:40]
	}
	return r
}
