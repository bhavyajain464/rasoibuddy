package services

import (
	"database/sql"
	"testing"
	"time"
)

func TestCanBillScanFreeTier(t *testing.T) {
	ent := buildEntitlements(TierFree, "", nil, 1)
	if ok, _ := CanBillScan(ent); !ok {
		t.Fatal("expected scan allowed at 1/2")
	}
	ent.BillScansUsed = 2
	if ok, _ := CanBillScan(ent); ok {
		t.Fatal("expected block at 2/2")
	}
}

func TestEffectiveBillScansUsedResetsOnNewDay(t *testing.T) {
	loc, _ := time.LoadLocation(billScanTimezone)
	yesterday := time.Now().In(loc).AddDate(0, 0, -1)
	if got := effectiveBillScansUsed(5, sql.NullTime{Time: yesterday, Valid: true}); got != 0 {
		t.Fatalf("expected 0 scans after day change, got %d", got)
	}
	today := time.Now().In(loc)
	if got := effectiveBillScansUsed(2, sql.NullTime{Time: today, Valid: true}); got != 2 {
		t.Fatalf("expected 2 scans today, got %d", got)
	}
}

func TestCanUseMealCategory(t *testing.T) {
	free := buildEntitlements(TierFree, "", nil, 0)
	if ok, _ := CanUseMealCategory(free, "daily"); !ok {
		t.Fatal("daily should be free")
	}
	if ok, _ := CanUseMealCategory(free, "rescue_meal"); ok {
		t.Fatal("rescue should require pro")
	}
	future := time.Now().Add(24 * time.Hour)
	pro := buildEntitlements(TierPro, IntervalMonthly, &future, 0)
	if ok, _ := CanUseMealCategory(pro, "most_tasty"); !ok {
		t.Fatal("pro should allow all categories")
	}
}

func TestExpiredProRevertsToFree(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	ent := buildEntitlements(TierPro, IntervalMonthly, &past, 0)
	if ent.PlanTier != TierFree {
		t.Fatalf("expected free after expiry, got %s", ent.PlanTier)
	}
	if ent.IsPro {
		t.Fatal("expired pro should not have pro features")
	}
}

func TestEliteHasDietAnalysisFlag(t *testing.T) {
	future := time.Now().Add(30 * 24 * time.Hour)
	ent := buildEntitlements(TierElite, IntervalYearly, &future, 0)
	if !ent.IsElite || !ent.HasDietAnalysis {
		t.Fatal("elite should expose diet analysis flag")
	}
}

func TestExtendPlanExpiryStacks(t *testing.T) {
	base := time.Now().Add(10 * 24 * time.Hour)
	ext := ExtendPlanExpiry(&base, IntervalMonthly)
	if !ext.After(base) {
		t.Fatal("expected extension after current expiry")
	}
}

func TestProEntitlementsJSONFields(t *testing.T) {
	future := time.Now().Add(365 * 24 * time.Hour)
	ent := buildEntitlements(TierPro, IntervalYearly, &future, 0)
	if !ent.IsPro {
		t.Fatal("expected is_pro true for active pro")
	}
	if ent.PlanTier != TierPro {
		t.Fatalf("expected plan_tier pro, got %s", ent.PlanTier)
	}
	if ent.BillScanLimit != -1 {
		t.Fatal("pro should have unlimited scans")
	}
}
