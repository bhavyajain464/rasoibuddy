package services

import (
	"fmt"
	"time"
)

const minChargePaise = 100 // ₹1 minimum Razorpay charge after credit

// SubscriptionState is the user's active paid plan (if any).
type SubscriptionState struct {
	Tier      string
	Interval  string
	ExpiresAt time.Time
}

// UpgradeQuote is a priced upgrade/checkout line with proration credit.
type UpgradeQuote struct {
	Target           PlanProduct `json:"target"`
	ListPricePaise   int         `json:"list_price_paise"`
	CreditPaise      int         `json:"credit_paise"`
	AmountPaise      int         `json:"amount_paise"`
	IsUpgrade        bool        `json:"is_upgrade"`
	IsRenewal        bool        `json:"is_renewal"`
	DaysRemaining    int         `json:"days_remaining"`
	DaysInPeriod     int         `json:"days_in_period"`
	CreditSummary    string      `json:"credit_summary"`
	AmountLabel      string      `json:"amount_label"`
}

// PeriodStartFromExpiry infers when the current billing period began.
func PeriodStartFromExpiry(expiresAt time.Time, interval string) time.Time {
	switch NormalizeInterval(interval) {
	case IntervalYearly:
		return expiresAt.AddDate(-1, 0, 0)
	default:
		return expiresAt.AddDate(0, -1, 0)
	}
}

func subscriptionStateFromEnt(ent Entitlements) SubscriptionState {
	st := SubscriptionState{Tier: TierFree}
	if ent.PlanExpiresAt == nil || ent.PlanTier == TierFree {
		return st
	}
	st.Tier = ent.PlanTier
	st.Interval = ent.PlanInterval
	st.ExpiresAt = *ent.PlanExpiresAt
	return st
}

func isSubscriptionActive(st SubscriptionState, now time.Time) bool {
	return st.Tier != TierFree && st.ExpiresAt.After(now)
}

// ComputeProrationCredit returns unused value (paise) from the current plan period.
func ComputeProrationCredit(st SubscriptionState, now time.Time) (creditPaise, daysRemaining, daysInPeriod int) {
	if !isSubscriptionActive(st, now) {
		return 0, 0, 0
	}
	product, ok := LookupPlanProduct(st.Tier, st.Interval)
	if !ok || product.AmountPaise <= 0 {
		return 0, 0, 0
	}
	periodEnd := st.ExpiresAt.UTC()
	periodStart := PeriodStartFromExpiry(periodEnd, st.Interval)
	if !periodStart.Before(periodEnd) {
		return 0, 0, 0
	}
	daysInPeriod = int(periodEnd.Sub(periodStart).Hours() / 24)
	if daysInPeriod < 1 {
		daysInPeriod = 1
	}
	daysRemaining = int(periodEnd.Sub(now.UTC()).Hours() / 24)
	if daysRemaining < 0 {
		daysRemaining = 0
	}
	if daysRemaining > daysInPeriod {
		daysRemaining = daysInPeriod
	}
	if daysRemaining == 0 {
		return 0, 0, daysInPeriod
	}
	creditPaise = (product.AmountPaise * daysRemaining) / daysInPeriod
	return creditPaise, daysRemaining, daysInPeriod
}

// IsUpgradePath is true when switching to a different paid SKU while current plan is active.
func IsUpgradePath(st SubscriptionState, target PlanProduct, now time.Time) bool {
	if !isSubscriptionActive(st, now) {
		return false
	}
	if st.Tier == target.Tier && st.Interval == target.Interval {
		return false
	}
	if tierRank(target.Tier) < tierRank(st.Tier) {
		return false
	}
	if st.Tier == target.Tier && st.Interval == IntervalYearly && target.Interval == IntervalMonthly {
		return false
	}
	return true
}

// IsRenewalPath is same tier+interval extension while still active.
func IsRenewalPath(st SubscriptionState, target PlanProduct, now time.Time) bool {
	return isSubscriptionActive(st, now) && st.Tier == target.Tier && st.Interval == target.Interval
}

// ComputeUpgradeQuote prices a target plan including proration credit from the current subscription.
func ComputeUpgradeQuote(st SubscriptionState, target PlanProduct, now time.Time) UpgradeQuote {
	q := UpgradeQuote{
		Target:         target,
		ListPricePaise: target.AmountPaise,
		AmountPaise:    target.AmountPaise,
		AmountLabel:    target.PriceLabel,
	}
	if IsRenewalPath(st, target, now) {
		q.IsRenewal = true
		q.CreditSummary = "Extends your current plan by another billing period."
		return q
	}
	if !IsUpgradePath(st, target, now) {
		q.CreditSummary = "New subscription"
		return q
	}
	credit, daysRem, daysTotal := ComputeProrationCredit(st, now)
	q.IsUpgrade = true
	q.CreditPaise = credit
	q.DaysRemaining = daysRem
	q.DaysInPeriod = daysTotal
	q.AmountPaise = target.AmountPaise - credit
	if q.AmountPaise < minChargePaise {
		q.AmountPaise = minChargePaise
	}
	if credit > 0 {
		q.CreditSummary = fmt.Sprintf(
			"₹%.2f credit for %d unused days on your current plan",
			float64(credit)/100, daysRem,
		)
		q.AmountLabel = fmt.Sprintf("₹%.2f today (was %s)", float64(q.AmountPaise)/100, target.PriceLabel)
	} else {
		q.CreditSummary = "Upgrade — no remaining credit on current plan"
	}
	return q
}

// ReplacePlanExpiry starts a fresh period from payment (used on upgrades).
func ReplacePlanExpiry(interval string) time.Time {
	now := time.Now().UTC()
	if NormalizeInterval(interval) == IntervalYearly {
		return now.AddDate(1, 0, 0)
	}
	return now.AddDate(0, 1, 0)
}

// BuildUpgradeOptions lists purchasable targets with quotes for the user's current subscription.
func BuildUpgradeOptions(ent Entitlements) []UpgradeQuote {
	st := subscriptionStateFromEnt(ent)
	now := time.Now().UTC()
	var out []UpgradeQuote
	for _, p := range PlanCatalog() {
		if !p.AvailableForPurchase {
			continue
		}
		if ent.IsElite && p.Tier == TierPro {
			continue
		}
		q := ComputeUpgradeQuote(st, p, now)
		if IsRenewalPath(st, p, now) && ent.IsPro {
			continue // hide identical renewal SKU unless we add explicit renew button later
		}
		if !ent.IsPro {
			out = append(out, q)
			continue
		}
		if q.IsUpgrade || tierRank(p.Tier) > tierRank(st.Tier) {
			out = append(out, q)
		}
	}
	return out
}

func formatINRPaise(paise int) string {
	return fmt.Sprintf("₹%.2f", float64(paise)/100)
}
