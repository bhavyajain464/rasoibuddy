package services

import (
	"testing"
	"time"
)

func TestTodayDateKeyIST(t *testing.T) {
	loc, _ := time.LoadLocation(MealOfDayTimezone)
	// 2026-05-27 18:30 UTC = 2026-05-28 00:00 IST
	utc := time.Date(2026, 5, 27, 18, 30, 0, 0, time.UTC)
	got := TodayDateKey(utc)
	if got != "2026-05-28" {
		t.Fatalf("TodayDateKey(IST midnight boundary) = %q, want 2026-05-28", got)
	}
	_ = loc
}
