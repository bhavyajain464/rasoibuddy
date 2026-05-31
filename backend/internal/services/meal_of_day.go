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
	MealOfDayTimezone   = "Asia/Kolkata"
	mealOfDayKeyPrefix  = "mealofday:"
	mealOfDayCacheTTL   = 36 * time.Hour
	MealOfDayCategoryID = "meal_of_day"
)

// CachedSmartMeal mirrors handlers.SmartMeal JSON for Redis storage.
type CachedSmartMeal struct {
	MealSlot       string   `json:"meal_slot,omitempty"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Ingredients    []string `json:"ingredients"`
	ItemsToOrder   []string `json:"items_to_order,omitempty"`
	CookingTime    int      `json:"cooking_time_mins"`
	Difficulty     string   `json:"difficulty"`
	WhyThisMeal    string   `json:"why_this_meal"`
	PairsWith      []string `json:"pairs_with,omitempty"`
	NutritionNotes string   `json:"nutrition_notes,omitempty"`
	StarCount      int      `json:"star_count,omitempty"`
	UserStarred    bool     `json:"user_starred,omitempty"`
}

// CachedMealCategory is the meal-of-the-day payload stored in Redis.
type CachedMealCategory struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Meals       []CachedSmartMeal `json:"meals"`
}

// MealOfDayEntry is the per-user cached suggestion for a calendar day (IST).
type MealOfDayEntry struct {
	Date          string             `json:"date"`
	Category      CachedMealCategory `json:"category"`
	GeneratedAt   string             `json:"generated_at"`
	Source        string             `json:"source"`
	InventoryUsed int                `json:"inventory_items_used,omitempty"`
}

// MealOfDayCache reads and writes per-user meal-of-the-day entries in Redis.
type MealOfDayCache struct {
	redis *redis.Client
}

func NewMealOfDayCache(r *redis.Client) *MealOfDayCache {
	return &MealOfDayCache{redis: r}
}

func (c *MealOfDayCache) Enabled() bool {
	return c != nil && c.redis != nil && c.redis.Enabled()
}

func mealOfDayLocation() *time.Location {
	loc, err := time.LoadLocation(MealOfDayTimezone)
	if err != nil {
		return time.FixedZone("IST", 5*3600+30*60)
	}
	return loc
}

// TodayDateKey returns today's calendar date in IST (YYYY-MM-DD).
func TodayDateKey(now time.Time) string {
	return now.In(mealOfDayLocation()).Format("2006-01-02")
}

func (c *MealOfDayCache) cacheKey(userID string) string {
	return mealOfDayKeyPrefix + strings.TrimSpace(userID)
}

// Get returns the user's entry when it has meals (serves last cached day until midnight refresh).
func (c *MealOfDayCache) Get(ctx context.Context, userID string) (*MealOfDayEntry, bool, error) {
	if !c.Enabled() {
		return nil, false, nil
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, false, fmt.Errorf("user_id is required")
	}
	raw, err := c.redis.Raw().Get(ctx, c.cacheKey(userID)).Result()
	if err == goredis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var entry MealOfDayEntry
	if err := json.Unmarshal([]byte(raw), &entry); err != nil {
		return nil, false, err
	}
	if len(entry.Category.Meals) == 0 {
		return nil, false, nil
	}
	return &entry, true, nil
}

// DeleteGlobalLegacy removes the old shared cache key (pre per-user breakfast/lunch/dinner).
func (c *MealOfDayCache) DeleteGlobalLegacy(ctx context.Context) error {
	if !c.Enabled() {
		return nil
	}
	return c.redis.Raw().Del(ctx, "mealofday:global").Err()
}

// ClearAll deletes every meal-of-the-day Redis key (per-user + legacy global).
func (c *MealOfDayCache) ClearAll(ctx context.Context) (deleted int64, keys []string, err error) {
	if !c.Enabled() {
		return 0, nil, fmt.Errorf("redis not configured")
	}
	pattern := mealOfDayKeyPrefix + "*"
	keys, err = c.redis.Raw().Keys(ctx, pattern).Result()
	if err != nil {
		return 0, nil, err
	}
	if len(keys) == 0 {
		return 0, keys, nil
	}
	n, err := c.redis.Raw().Del(ctx, keys...).Result()
	return n, keys, err
}

// Set stores the user's meal-of-the-day entry.
func (c *MealOfDayCache) Set(ctx context.Context, userID string, entry MealOfDayEntry) error {
	if !c.Enabled() {
		return fmt.Errorf("redis not configured")
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return fmt.Errorf("user_id is required")
	}
	if entry.Date == "" {
		entry.Date = TodayDateKey(time.Now())
	}
	b, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	return c.redis.Raw().Set(ctx, c.cacheKey(userID), b, mealOfDayCacheTTL).Err()
}
