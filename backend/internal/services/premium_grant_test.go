package services

import (
	"os"
	"testing"
	"time"
)

func TestComplimentaryPremiumGrantEmail(t *testing.T) {
	t.Setenv("PREMIUM_GRANT_EMAILS", "dev@example.com, beta@test.com ")
	t.Setenv("PREMIUM_GRANT_TIER", "pro")

	tier, interval, exp := applyComplimentaryPremium("dev@example.com", TierFree, "", nil)
	if tier != TierPro || interval != "" || exp != nil {
		t.Fatalf("expected complimentary pro, got tier=%s interval=%q exp=%v", tier, interval, exp)
	}

	ent := buildEntitlements(tier, interval, exp, 0)
	if !ent.IsPro || ent.IsElite {
		t.Fatal("expected is_pro without elite")
	}
}

func TestComplimentaryPremiumKeepsActivePaidTier(t *testing.T) {
	t.Setenv("PREMIUM_GRANT_EMAILS", "dev@example.com")
	t.Setenv("PREMIUM_GRANT_TIER", "pro")

	future := time.Now().Add(30 * 24 * time.Hour)
	tier, interval, exp := applyComplimentaryPremium("dev@example.com", TierElite, IntervalYearly, &future)
	if tier != TierElite || interval != IntervalYearly || exp == nil || !exp.Equal(future) {
		t.Fatal("expected to keep active elite subscription")
	}
}

func TestComplimentaryPremiumGrantElite(t *testing.T) {
	t.Setenv("PREMIUM_GRANT_EMAILS", "founder@example.com")
	t.Setenv("PREMIUM_GRANT_TIER", "elite")

	tier, _, exp := applyComplimentaryPremium("founder@example.com", TierFree, "", nil)
	if tier != TierElite || exp != nil {
		t.Fatalf("expected complimentary elite, got tier=%s exp=%v", tier, exp)
	}
	ent := buildEntitlements(tier, "", exp, 0)
	if !ent.IsElite || !ent.HasDietAnalysis {
		t.Fatal("expected elite entitlements")
	}
}

func TestComplimentaryPremiumGrantSemicolonList(t *testing.T) {
	t.Setenv("PREMIUM_GRANT_EMAILS", "a@example.com;b@example.com")
	t.Setenv("PREMIUM_GRANT_TIER", "pro")

	tier, _, _ := applyComplimentaryPremium("b@example.com", TierFree, "", nil)
	if tier != TierPro {
		t.Fatalf("expected pro for semicolon-listed email, got %s", tier)
	}
}

func TestComplimentaryPremiumNoMatch(t *testing.T) {
	os.Unsetenv("PREMIUM_GRANT_EMAILS")
	tier, interval, exp := applyComplimentaryPremium("other@example.com", TierFree, "", nil)
	if tier != TierFree || interval != "" || exp != nil {
		t.Fatal("expected unchanged free tier")
	}
}
