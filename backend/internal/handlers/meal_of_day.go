package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"
)

var (
	mealOfDayLastRunDate string
	mealOfDayRunMu       sync.Mutex
)

var mealOfDaySlots = []struct {
	Slot     string
	MealType string
}{
	{Slot: "breakfast", MealType: "breakfast"},
	{Slot: "lunch", MealType: "lunch_dinner"},
	{Slot: "dinner", MealType: "dinner"},
}

// MealOfDayResponse is returned by GET /meals/meal-of-day (per-user Redis cache).
type MealOfDayResponse struct {
	Date           string         `json:"date"`
	Categories     []MealCategory `json:"categories"`
	GeneratedAt    string         `json:"generated_at"`
	Source         string         `json:"source"`
	CacheAvailable bool           `json:"cache_available"`
	CacheStale     bool           `json:"cache_stale,omitempty"`
	Personalized   bool           `json:"personalized"`
}

func GetMealOfDay(cache *services.MealOfDayCache, db *sql.DB, cfg *config.Config, cookedLog *services.CookedLogService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		w.Header().Set("Content-Type", "application/json")
		if cache == nil || !cache.Enabled() {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "meal_of_day_unavailable",
				"message": "Meal of the Day cache is not available. Try again later.",
			})
			return
		}
		entry, ok, err := cache.Get(r.Context(), userID)
		if err != nil {
			log.Printf("[meal-of-day] cache read user=%s: %v", userID, err)
			http.Error(w, "Failed to load meal of the day", http.StatusInternalServerError)
			return
		}
		if ok && entry != nil && !mealOfDayEntryComplete(entry) {
			log.Printf("[meal-of-day] incomplete cache user=%s (%d meals), regenerating", userID, len(entry.Category.Meals))
			ok = false
			entry = nil
		}
		if !ok || entry == nil {
			if err := GenerateAndCacheMealOfDayForUser(r.Context(), db, cfg, cookedLog, cache, userID); err != nil {
				log.Printf("[meal-of-day] on-demand generate user=%s: %v", userID, err)
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "meal_of_day_not_ready",
					"message": "Could not prepare today's meals. Try again in a moment.",
					"date":    services.TodayDateKey(time.Now()),
				})
				return
			}
			entry, ok, err = cache.Get(r.Context(), userID)
			if err != nil || !ok || entry == nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "meal_of_day_not_ready",
					"message": "Today's meals are prepared at midnight (12:00 AM). Check back soon.",
					"date":    services.TodayDateKey(time.Now()),
				})
				return
			}
		}
		cat := mealCategoryFromCached(entry.Category)
		applyUserStarsToCategory(db, userID, &cat)
		today := services.TodayDateKey(time.Now())
		json.NewEncoder(w).Encode(MealOfDayResponse{
			Date:           entry.Date,
			Categories:     []MealCategory{cat},
			GeneratedAt:    entry.GeneratedAt,
			Source:         entry.Source,
			CacheAvailable: true,
			CacheStale:     entry.Date != today,
			Personalized:   true,
		})
	}
}

// mealOfDayEntryComplete requires breakfast, lunch, and dinner in cache.
func mealOfDayEntryComplete(entry *services.MealOfDayEntry) bool {
	if entry == nil || len(entry.Category.Meals) < len(mealOfDaySlots) {
		return false
	}
	want := map[string]bool{"breakfast": false, "lunch": false, "dinner": false}
	for _, m := range entry.Category.Meals {
		slot := strings.ToLower(strings.TrimSpace(m.MealSlot))
		if _, ok := want[slot]; ok && strings.TrimSpace(m.Name) != "" {
			want[slot] = true
		}
	}
	for _, ok := range want {
		if !ok {
			return false
		}
	}
	return true
}

func applyUserStarsToCategory(db *sql.DB, userID string, cat *MealCategory) {
	if cat == nil || userID == "" {
		return
	}
	globalStars, _ := services.LoadGlobalStarCounts(db)
	userStarred, _ := services.LoadUserStarredDishes(db, userID)
	applyUserStarsToCategoryWithMaps(cat, globalStars, userStarred)
}

func applyUserStarsToCategoryWithMaps(cat *MealCategory, globalStars map[string]int, userStarred map[string]bool) {
	if cat == nil {
		return
	}
	for i := range cat.Meals {
		key := services.NormalizeDishName(cat.Meals[i].Name)
		if globalStars != nil {
			cat.Meals[i].StarCount = globalStars[key]
		}
		if userStarred != nil {
			cat.Meals[i].UserStarred = userStarred[key]
		}
		if strings.TrimSpace(cat.Meals[i].DishID) == "" {
			if dish, ok := services.FindCatalogDishByName(cat.Meals[i].Name); ok {
				cat.Meals[i].DishID = dish.ID
			}
		}
	}
}

func mealCategoryFromCached(c services.CachedMealCategory) MealCategory {
	meals := make([]SmartMeal, 0, len(c.Meals))
	for _, m := range c.Meals {
		meals = append(meals, SmartMeal{
			MealSlot:       m.MealSlot,
			DishID:         m.DishID,
			Name:           m.Name,
			Description:    m.Description,
			Ingredients:    m.Ingredients,
			ItemsToOrder:   m.ItemsToOrder,
			CookingTime:    m.CookingTime,
			Difficulty:     m.Difficulty,
			WhyThisMeal:    m.WhyThisMeal,
			PairsWith:      m.PairsWith,
			NutritionNotes: m.NutritionNotes,
			StarCount:      m.StarCount,
			UserStarred:    m.UserStarred,
		})
	}
	return MealCategory{
		ID:          c.ID,
		Title:       c.Title,
		Description: c.Description,
		Meals:       meals,
	}
}

func cachedCategoryFromMeal(cat MealCategory) services.CachedMealCategory {
	meals := make([]services.CachedSmartMeal, 0, len(cat.Meals))
	for _, m := range cat.Meals {
		meals = append(meals, services.CachedSmartMeal{
			MealSlot:       m.MealSlot,
			DishID:         m.DishID,
			Name:           m.Name,
			Description:    m.Description,
			Ingredients:    m.Ingredients,
			ItemsToOrder:   m.ItemsToOrder,
			CookingTime:    m.CookingTime,
			Difficulty:     m.Difficulty,
			WhyThisMeal:    m.WhyThisMeal,
			PairsWith:      m.PairsWith,
			NutritionNotes: m.NutritionNotes,
			StarCount:      m.StarCount,
			UserStarred:    false,
		})
	}
	return services.CachedMealCategory{
		ID:          cat.ID,
		Title:       cat.Title,
		Description: cat.Description,
		Meals:       meals,
	}
}

// GenerateAndCacheMealOfDayForUser builds breakfast, lunch, and dinner using user prefs.
func GenerateAndCacheMealOfDayForUser(
	ctx context.Context,
	db *sql.DB,
	cfg *config.Config,
	cookedLog *services.CookedLogService,
	cache *services.MealOfDayCache,
	userID string,
) error {
	if cache == nil || !cache.Enabled() {
		return fmt.Errorf("redis not configured")
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return fmt.Errorf("user_id is required")
	}
	meta := categoryMeta[services.MealOfDayCategoryID]
	var meals []SmartMeal
	var exclude []string
	source := "ai"
	generatedAt := time.Now().Format(time.RFC3339)
	inventoryUsed := 0

	for _, slot := range mealOfDaySlots {
		resp, err := generateSmartMeals(ctx, db, cfg, cookedLog, smartMealsGenerateInput{
			UserID:           userID,
			Category:         services.MealOfDayCategoryID,
			MealType:         slot.MealType,
			MealOfDayForUser: true,
			Exclude:          append([]string(nil), exclude...),
		})
		if err != nil {
			return fmt.Errorf("generate %s: %w", slot.Slot, err)
		}
		if resp.InventoryUsed > inventoryUsed {
			inventoryUsed = resp.InventoryUsed
		}
		if resp.Source == "fallback" {
			source = "fallback"
		}
		if resp.GeneratedAt != "" {
			generatedAt = resp.GeneratedAt
		}
		cat := pickMealOfDayCategory(resp.Categories)
		if cat == nil || len(cat.Meals) == 0 {
			log.Printf("[meal-of-day] no dish for user=%s slot=%s", userID, slot.Slot)
			continue
		}
		m := cat.Meals[0]
		m.MealSlot = slot.Slot
		if m.WhyThisMeal == "" {
			m.WhyThisMeal = fmt.Sprintf("Picked for your %s based on your preferences.", slotLabel(slot.Slot))
		}
		meals = append(meals, m)
		exclude = append(exclude, m.Name)
	}

	if len(meals) == 0 {
		return fmt.Errorf("no meals generated")
	}

	cat := MealCategory{
		ID:          services.MealOfDayCategoryID,
		Title:       meta.Title,
		Description: meta.Desc,
		Meals:       meals,
	}
	return cache.Set(ctx, userID, services.MealOfDayEntry{
		Date:          services.TodayDateKey(time.Now()),
		Category:      cachedCategoryFromMeal(cat),
		GeneratedAt:   generatedAt,
		Source:        source,
		InventoryUsed: inventoryUsed,
	})
}

func slotLabel(slot string) string {
	switch slot {
	case "breakfast":
		return "breakfast"
	case "lunch":
		return "lunch"
	case "dinner":
		return "dinner"
	default:
		return slot
	}
}

func pickMealOfDayCategory(categories []MealCategory) *MealCategory {
	for i := range categories {
		if categories[i].ID == services.MealOfDayCategoryID && len(categories[i].Meals) > 0 {
			return &categories[i]
		}
	}
	if len(categories) > 0 && len(categories[0].Meals) > 0 {
		c := categories[0]
		c.ID = services.MealOfDayCategoryID
		if c.Title == "" {
			c.Title = categoryMeta[services.MealOfDayCategoryID].Title
		}
		if c.Description == "" {
			c.Description = categoryMeta[services.MealOfDayCategoryID].Desc
		}
		return &c
	}
	return nil
}

// MealOfDayRefreshRequest is the admin body for POST /admin/meal-of-day/refresh.
type MealOfDayRefreshRequest struct {
	UserID   string `json:"user_id,omitempty"`
	Email    string `json:"email,omitempty"`
	AllUsers bool   `json:"all_users,omitempty"`
}

// MealOfDayRefreshResponse summarizes an admin cache refresh.
type MealOfDayRefreshResponse struct {
	Date    string                      `json:"date"`
	Cached  int                         `json:"cached"`
	Failed  int                         `json:"failed"`
	Users   []MealOfDayRefreshUserEntry `json:"users,omitempty"`
}

type MealOfDayRefreshUserEntry struct {
	UserID  string   `json:"user_id"`
	Status  string   `json:"status"`
	Message string   `json:"message,omitempty"`
	Dishes  []string `json:"dishes,omitempty"`
}

func listAllUserIDs(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT user_id::text FROM users`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// RefreshMealOfDayCache fills Redis for the given users (empty = all users).
func RefreshMealOfDayCache(
	ctx context.Context,
	db *sql.DB,
	cfg *config.Config,
	cookedLog *services.CookedLogService,
	cache *services.MealOfDayCache,
	userIDs []string,
	includeDetails bool,
) (MealOfDayRefreshResponse, error) {
	out := MealOfDayRefreshResponse{Date: services.TodayDateKey(time.Now())}
	if cache == nil || !cache.Enabled() {
		return out, fmt.Errorf("redis not configured")
	}
	if len(userIDs) == 0 {
		var err error
		userIDs, err = listAllUserIDs(ctx, db)
		if err != nil {
			return out, err
		}
	}
	for _, userID := range userIDs {
		userID = strings.TrimSpace(userID)
		if userID == "" {
			continue
		}
		entry := MealOfDayRefreshUserEntry{UserID: userID}
		if err := GenerateAndCacheMealOfDayForUser(ctx, db, cfg, cookedLog, cache, userID); err != nil {
			out.Failed++
			entry.Status = "failed"
			entry.Message = err.Error()
			if includeDetails {
				out.Users = append(out.Users, entry)
			}
			continue
		}
		cached, ok, _ := cache.Get(ctx, userID)
		if !ok || cached == nil || len(cached.Category.Meals) == 0 {
			out.Failed++
			entry.Status = "empty"
			if includeDetails {
				out.Users = append(out.Users, entry)
			}
			continue
		}
		out.Cached++
		entry.Status = "cached"
		for _, m := range cached.Category.Meals {
			entry.Dishes = append(entry.Dishes, fmt.Sprintf("%s: %s", slotLabel(m.MealSlot), m.Name))
		}
		if includeDetails {
			out.Users = append(out.Users, entry)
		}
	}
	return out, nil
}

// MealOfDayClearCacheResponse summarizes POST /admin/meal-of-day/clear-cache.
type MealOfDayClearCacheResponse struct {
	Deleted int      `json:"deleted"`
	Keys    []string `json:"keys"`
}

// AdminClearMealOfDayCache POST /admin/meal-of-day/clear-cache
func AdminClearMealOfDayCache(cache *services.MealOfDayCache) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if cache == nil || !cache.Enabled() {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "redis_unavailable",
				"message": "REDIS_URL is not configured or Redis is unreachable",
			})
			return
		}
		n, keys, err := cache.ClearAll(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "clear_failed", "message": err.Error()})
			return
		}
		log.Printf("[admin] meal-of-day clear-cache deleted=%d keys=%d", n, len(keys))
		json.NewEncoder(w).Encode(MealOfDayClearCacheResponse{Deleted: int(n), Keys: keys})
	}
}

// AdminRefreshMealOfDay POST /admin/meal-of-day/refresh
func AdminRefreshMealOfDay(
	db *sql.DB,
	cfg *config.Config,
	cookedLog *services.CookedLogService,
	cache *services.MealOfDayCache,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if cache == nil || !cache.Enabled() {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "redis_unavailable",
				"message": "REDIS_URL is not configured or Redis is unreachable",
			})
			return
		}
		var req MealOfDayRefreshRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}
		}
		var userIDs []string
		if strings.TrimSpace(req.UserID) != "" || strings.TrimSpace(req.Email) != "" {
			userID, err := services.ResolveUserID(db, req.UserID, req.Email)
			if err != nil {
				writeAdminError(w, err)
				return
			}
			userIDs = []string{userID}
		}
		result, err := RefreshMealOfDayCache(r.Context(), db, cfg, cookedLog, cache, userIDs, true)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(result)
			return
		}
		log.Printf("[admin] meal-of-day refresh date=%s cached=%d failed=%d",
			result.Date, result.Cached, result.Failed)
		json.NewEncoder(w).Encode(result)
	}
}

// RunMidnightMealOfDayRefresh generates personalized meals at 00:00 IST.
func RunMidnightMealOfDayRefresh(
	ctx context.Context,
	db *sql.DB,
	cfg *config.Config,
	cookedLog *services.CookedLogService,
	cache *services.MealOfDayCache,
) {
	if cache == nil || !cache.Enabled() {
		return
	}
	loc, _ := time.LoadLocation(services.MealOfDayTimezone)
	if loc == nil {
		loc = time.FixedZone("IST", 5*3600+30*60)
	}
	now := time.Now().In(loc)
	if now.Hour() != 0 {
		return
	}
	dateKey := services.TodayDateKey(now)
	mealOfDayRunMu.Lock()
	if mealOfDayLastRunDate == dateKey {
		mealOfDayRunMu.Unlock()
		return
	}
	mealOfDayLastRunDate = dateKey
	mealOfDayRunMu.Unlock()

	log.Printf("[meal-of-day] midnight personalized refresh (date=%s)", dateKey)
	result, err := RefreshMealOfDayCache(ctx, db, cfg, cookedLog, cache, nil, false)
	if err != nil {
		log.Printf("[meal-of-day] midnight refresh error: %v", err)
		return
	}
	log.Printf("[meal-of-day] midnight refresh done: cached=%d failed=%d", result.Cached, result.Failed)
}

// StartMealOfDayScheduler runs the 12:00 AM IST job when Redis is configured.
func StartMealOfDayScheduler(
	db *sql.DB,
	cfg *config.Config,
	cookedLog *services.CookedLogService,
	cache *services.MealOfDayCache,
) {
	if cache == nil || !cache.Enabled() {
		log.Printf("[meal-of-day] scheduler disabled (REDIS_URL empty or Redis unavailable)")
		return
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			RunMidnightMealOfDayRefresh(context.Background(), db, cfg, cookedLog, cache)
		}
	}()
	log.Printf("[meal-of-day] scheduler started (00:00 %s daily, per-user Redis cache)", services.MealOfDayTimezone)
}
