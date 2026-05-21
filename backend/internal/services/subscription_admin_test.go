package services

import (
	"testing"
	"time"
)

func TestEffectiveTierExpired(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	ent := buildEntitlements(TierPro, IntervalMonthly, &past, 0)
	if ent.PlanTier != TierFree || ent.IsPro {
		t.Fatal("expired pro should be free")
	}
}
