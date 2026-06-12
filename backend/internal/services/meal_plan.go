package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"kitchenai-backend/internal/redis"

	goredis "github.com/redis/go-redis/v9"
)

const (
	mealPlanKeyPrefix = "mealplan:"
	mealPlanCacheTTL  = 8 * 24 * time.Hour
	mealPlanDays      = 7
)

// MealPlanDaysCount is the rolling window length (today + next 6 days).
func MealPlanDaysCount() int { return mealPlanDays }

// WeekPlanDay is one calendar day in the kitchen meal plan.
type WeekPlanDay struct {
	Date     string            `json:"date"`
	Category CachedMealCategory `json:"category"`
}

// WeekPlanEntry is the shared 7-day plan for a household kitchen.
type WeekPlanEntry struct {
	KitchenID     string        `json:"kitchen_id"`
	AnchorDate    string        `json:"anchor_date"`
	Days          []WeekPlanDay `json:"days"`
	GeneratedAt   string        `json:"generated_at"`
	Source        string        `json:"source"`
	InventoryUsed int           `json:"inventory_items_used,omitempty"`
}

// MealPlanCache reads and writes kitchen week plans in Redis.
type MealPlanCache struct {
	redis *redis.Client
}

func NewMealPlanCache(r *redis.Client) *MealPlanCache {
	return &MealPlanCache{redis: r}
}

func (c *MealPlanCache) Enabled() bool {
	return c != nil && c.redis != nil && c.redis.Enabled()
}

func (c *MealPlanCache) cacheKey(kitchenID string) string {
	return mealPlanKeyPrefix + strings.TrimSpace(kitchenID)
}

// Get returns the kitchen week plan when present.
func (c *MealPlanCache) Get(ctx context.Context, kitchenID string) (*WeekPlanEntry, bool, error) {
	if !c.Enabled() {
		return nil, false, nil
	}
	kitchenID = strings.TrimSpace(kitchenID)
	if kitchenID == "" {
		return nil, false, fmt.Errorf("kitchen_id is required")
	}
	raw, err := c.redis.Raw().Get(ctx, c.cacheKey(kitchenID)).Result()
	if err == goredis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var entry WeekPlanEntry
	if err := json.Unmarshal([]byte(raw), &entry); err != nil {
		return nil, false, err
	}
	if len(entry.Days) == 0 {
		return nil, false, nil
	}
	return &entry, true, nil
}

// Set stores the kitchen week plan.
func (c *MealPlanCache) Set(ctx context.Context, kitchenID string, entry WeekPlanEntry) error {
	if !c.Enabled() {
		return fmt.Errorf("redis not configured")
	}
	kitchenID = strings.TrimSpace(kitchenID)
	if kitchenID == "" {
		return fmt.Errorf("kitchen_id is required")
	}
	entry.KitchenID = kitchenID
	b, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	return c.redis.Raw().Set(ctx, c.cacheKey(kitchenID), b, mealPlanCacheTTL).Err()
}

// ParseDateKey parses YYYY-MM-DD in IST context.
func ParseDateKey(dateKey string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", strings.TrimSpace(dateKey), mealOfDayLocation())
}

// DateKeyAdd returns dateKey + days as YYYY-MM-DD.
func DateKeyAdd(dateKey string, days int) (string, error) {
	t, err := ParseDateKey(dateKey)
	if err != nil {
		return "", err
	}
	return t.AddDate(0, 0, days).Format("2006-01-02"), nil
}

// WeekPlanDateRange returns today through today+6 as date keys.
func WeekPlanDateRange(today string) ([]string, error) {
	out := make([]string, 0, mealPlanDays)
	cur := today
	var err error
	for i := 0; i < mealPlanDays; i++ {
		out = append(out, cur)
		if i < mealPlanDays-1 {
			cur, err = DateKeyAdd(cur, 1)
			if err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// NormalizeWeekPlan trims past days and ensures a continuous 7-day window from today.
func NormalizeWeekPlan(entry *WeekPlanEntry, today string) (*WeekPlanEntry, bool, error) {
	if entry == nil {
		return nil, false, nil
	}
	wantDates, err := WeekPlanDateRange(today)
	if err != nil {
		return nil, false, err
	}
	byDate := map[string]WeekPlanDay{}
	for _, d := range entry.Days {
		if strings.TrimSpace(d.Date) != "" && len(d.Category.Meals) > 0 {
			byDate[d.Date] = d
		}
	}
	out := WeekPlanEntry{
		KitchenID:     entry.KitchenID,
		AnchorDate:    today,
		GeneratedAt:   entry.GeneratedAt,
		Source:        entry.Source,
		InventoryUsed: entry.InventoryUsed,
		Days:          make([]WeekPlanDay, 0, mealPlanDays),
	}
	changed := entry.AnchorDate != today || len(entry.Days) != mealPlanDays
	for _, date := range wantDates {
		if day, ok := byDate[date]; ok {
			out.Days = append(out.Days, day)
		} else {
			changed = true
		}
	}
	if len(out.Days) < mealPlanDays {
		changed = true
	}
	return &out, changed, nil
}
