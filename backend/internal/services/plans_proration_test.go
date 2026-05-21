package services

import (
	"testing"
	"time"
)

func TestComputeProrationCreditMonthly(t *testing.T) {
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	expires := now.Add(15 * 24 * time.Hour)
	st := SubscriptionState{Tier: TierPro, Interval: IntervalMonthly, ExpiresAt: expires}
	credit, daysRem, _ := ComputeProrationCredit(st, now)
	if daysRem < 14 || daysRem > 16 {
		t.Fatalf("days remaining ~15, got %d", daysRem)
	}
	if credit <= 0 || credit >= 9900 {
		t.Fatalf("expected partial credit, got %d", credit)
	}
}

func TestUpgradeQuoteProMonthlyToYearly(t *testing.T) {
	now := time.Now().UTC()
	expires := now.Add(20 * 24 * time.Hour)
	st := SubscriptionState{Tier: TierPro, Interval: IntervalMonthly, ExpiresAt: expires}
	yearly, _ := LookupPlanProduct(TierPro, IntervalYearly)
	q := ComputeUpgradeQuote(st, yearly, now)
	if !q.IsUpgrade {
		t.Fatal("expected upgrade path")
	}
	if q.AmountPaise >= q.ListPricePaise {
		t.Fatal("expected discount from credit")
	}
	if q.CreditPaise <= 0 {
		t.Fatal("expected credit")
	}
}

func TestReplacePlanExpiryOnUpgrade(t *testing.T) {
	before := time.Now().UTC()
	exp := ReplacePlanExpiry(IntervalMonthly)
	if !exp.After(before.Add(25 * 24 * time.Hour)) {
		t.Fatal("expected ~1 month ahead")
	}
}
