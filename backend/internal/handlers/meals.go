package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"strings"
	"time"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"

	"github.com/google/generative-ai-go/genai"
	"github.com/lib/pq"
	"google.golang.org/api/option"
)

type MealCategory struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	Meals       []SmartMeal `json:"meals"`
}

type SmartMeal struct {
	MealSlot       string   `json:"meal_slot,omitempty"` // breakfast | lunch | dinner (meal of the day)
	DishID         string   `json:"dish_id,omitempty"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Ingredients     []string                          `json:"ingredients"`
	IngredientIDs   []string                          `json:"ingredient_ids,omitempty"`
	ItemsToOrder    []string                          `json:"items_to_order,omitempty"`
	CookingTime    int      `json:"cooking_time_mins"`
	Difficulty     string   `json:"difficulty"`
	WhyThisMeal    string   `json:"why_this_meal"`
	PairsWith       []string                          `json:"pairs_with,omitempty"`
	PairIngredients services.PairIngredientLinesMap   `json:"pair_ingredients,omitempty"`
	NutritionNotes  string              `json:"nutrition_notes,omitempty"`
	StarCount      int      `json:"star_count,omitempty"`   // global stars from all users
	UserStarred    bool     `json:"user_starred,omitempty"` // this user already starred (one star per user)
}

type SmartMealsResponse struct {
	Categories    []MealCategory `json:"categories"`
	InventoryUsed int            `json:"inventory_items_used"`
	GeneratedAt   string         `json:"generated_at"`
	Source        string         `json:"source"` // "ai" or "fallback"
}

var categoryMeta = map[string]struct {
	Title string
	Desc  string
	Rule  string
}{
	"rescue_meal":  {Title: "Rescue Meal", Desc: "Use expiring items before they go to waste", Rule: "MUST use the expiring/expired items listed above. Use ONLY inventory items. This is urgent. \"items_to_order\" MUST be empty []."},
	"meal_of_day":  {Title: "Meal of the Day", Desc: "Your breakfast, lunch, and dinner for today", Rule: "Pick one familiar, practical Indian home-cooking dish from the shortlist for the requested meal slot. MUST respect the user's dietary constraints above. \"items_to_order\" may list staples not in their pantry."},
	"most_healthy": {Title: "Most Healthy", Desc: "Nutrient-rich meals for a balanced diet", Rule: "GENERAL suggestions. You may suggest dishes that require items NOT in inventory. List any items NOT in inventory in \"items_to_order\"."},
	"most_tasty":   {Title: "Most Tasty", Desc: "Crowd-pleasing delicious meals", Rule: "GENERAL suggestions. You may suggest dishes that require items NOT in inventory. List any items NOT in inventory in \"items_to_order\"."},
	"long_lasting": {Title: "Cook Now, Eat Later", Desc: "Meals that store well for days", Rule: "GENERAL suggestions for batch cooking. You may suggest dishes that require items NOT in inventory. List any items NOT in inventory in \"items_to_order\"."},
	"daily":        {Title: "Daily", Desc: "Simple everyday dish ideas — no special constraints", Rule: "Everyday dish ideas only. Do NOT optimize for expiring inventory, meal prep, or health goals. Suggest familiar, practical home-cooking dishes anyone might make today. Inventory is optional context only — you may ignore it. You may suggest dishes that need items NOT in inventory; list those in \"items_to_order\". Keep suggestions approachable (easy/medium difficulty)."},
}

const (
	maxInventoryInMealPrompt = 35
	maxInventoryInGroqPrompt = 18
	maxRecentDishesInPrompt  = 12
	maxCookDishesInPrompt    = 12
	maxMemoriesInPrompt      = 5
	expiringSoonDaysForMeals = 7
	maxIngredientsInMeal     = 12
	maxItemsToOrder          = 8
)

type smartMealsGenerateInput struct {
	UserID     string
	Category   string
	MealType   string
	UserPrompt string
	Exclude    []string
	// Global: deprecated shared cache (unused; meal-of-day is per-user).
	Global bool
	// MealOfDayForUser: personalized breakfast/lunch/dinner using prefs, allergies, and optional pantry.
	MealOfDayForUser bool
	// PlanDate sets the calendar day for deterministic sampling (week plan).
	PlanDate time.Time
	// SeedKey overrides userID in suggestionSeed (kitchen_id for shared plans).
	SeedKey string
	// RefreshNonce makes regeneration pick a different dish (week-plan refresh).
	RefreshNonce string
}

// suggestionSeed derives a deterministic seed from user + calendar day + meal slot.
// Same user/day/slot => stable pick (screen refresh won't reshuffle); a new day or slot
// => fresh ordering. Drives the variance sampler in services.RetrieveDishes.
func suggestionSeed(userID, mealSlot string, now time.Time) int64 {
	if now.IsZero() {
		now = time.Now()
	}
	h := fnv.New64a()
	_, _ = h.Write([]byte(userID + "|" + now.Format("2006-01-02") + "|" + strings.ToLower(strings.TrimSpace(mealSlot))))
	return int64(h.Sum64() & 0x7fffffffffffffff)
}

func generateSmartMeals(
	ctx context.Context,
	db *sql.DB,
	cfg *config.Config,
	cookedLog *services.CookedLogService,
	in smartMealsGenerateInput,
) (SmartMealsResponse, error) {
	userID := strings.TrimSpace(in.UserID)
	category := strings.TrimSpace(in.Category)
	mealType := strings.TrimSpace(in.MealType)
	userPrompt := strings.TrimSpace(in.UserPrompt)
	effectiveMeal := services.ResolveEffectiveMealTypeFilter(mealType, userPrompt)

	var inventory []inventoryRow
	var userPrefs *services.UserPrefsData
	var recentDishes []string
	var cookedDays, suggestedDays map[string]int
	invNames := []string(nil)

	if in.Global {
		category = "daily"
	} else if in.MealOfDayForUser {
		// Catalog retrieval respects diet/dislikes without requiring pantry stock.
		if category == "" || category == services.MealOfDayCategoryID {
			category = "daily"
		}
		inventory = fetchUserInventory(db, userID)
		userPrefs = fetchUserPreferences(db, userID)
		if userPrefs != nil {
			inventory = filterInventoryByDiet(inventory, userPrefs.DietaryTags)
		}
		if cookedLog != nil {
			if entries, _, err := cookedLog.ListEatenLast15Days(ctx, userID); err == nil {
				seen := map[string]bool{}
				for _, e := range entries {
					name := strings.TrimSpace(e.DishName)
					key := strings.ToLower(name)
					if name == "" || seen[key] {
						continue
					}
					seen[key] = true
					recentDishes = append(recentDishes, name)
					if len(recentDishes) >= maxRecentDishesInPrompt {
						break
					}
				}
			}
			if m, err := cookedLog.ListRecentEatenDays(ctx, userID, services.CookedHistoryDays); err == nil {
				cookedDays = m
			}
			if m, err := cookedLog.ListRecentMealSuggestionDays(ctx, userID, 14); err == nil {
				suggestedDays = m
			}
		}
		inventory = trimInventoryForMealPrompt(inventory)
		for _, item := range inventory {
			invNames = append(invNames, item.Name)
		}
	} else {
		inventory = fetchUserInventory(db, userID)
		userPrefs = fetchUserPreferences(db, userID)
		if userPrefs != nil {
			inventory = filterInventoryByDiet(inventory, userPrefs.DietaryTags)
		}
		if cookedLog != nil {
			if entries, _, err := cookedLog.ListEatenLast15Days(ctx, userID); err == nil {
				seen := map[string]bool{}
				for _, e := range entries {
					name := strings.TrimSpace(e.DishName)
					key := strings.ToLower(name)
					if name == "" || seen[key] {
						continue
					}
					seen[key] = true
					recentDishes = append(recentDishes, name)
					if len(recentDishes) >= maxRecentDishesInPrompt {
						break
					}
				}
			}
		}
		inventory = trimInventoryForMealPrompt(inventory)
		for _, item := range inventory {
			invNames = append(invNames, item.Name)
		}
		if cookedLog != nil {
			if m, err := cookedLog.ListRecentEatenDays(ctx, userID, services.CookedHistoryDays); err == nil {
				cookedDays = m
			}
			if m, err := cookedLog.ListRecentMealSuggestionDays(ctx, userID, 14); err == nil {
				suggestedDays = m
			}
		}
	}

	planNow := in.PlanDate
	if planNow.IsZero() {
		planNow = time.Now()
	}
	expiringNames := expiringInventoryNames(inventory, planNow)
	retrieveIn := services.DishRetrieveInput{
		Category:         category,
		UserPrompt:       userPrompt,
		MealTypeFilter:   mealType,
		CookedDaysAgo:    cookedDays,
		SuggestedDaysAgo: suggestedDays,
		TopK:             services.CatalogRetrieveTopK,
		Now:              planNow,
	}
	if category == "rescue_meal" {
		retrieveIn.InventoryNames = invNames
		retrieveIn.ExpiringNames = expiringNames
	}
	if userPrefs != nil {
		retrieveIn.DietaryTags = userPrefs.DietaryTags
		retrieveIn.Allergies = userPrefs.Allergies
		retrieveIn.Dislikes = userPrefs.Dislikes
		retrieveIn.FavCuisines = userPrefs.FavCuisines
		retrieveIn.SpiceLevel = userPrefs.SpiceLevel
		retrieveIn.Memories = userPrefs.Memories
	}
	// Variance: per-user, per-day, per-slot weighted sampling so suggestions rotate and
	// don't repeat. Global (shared) meal-of-day stays deterministic for caching.
	if !in.Global {
		retrieveIn.Temperature = 0.7
		seedScope := userID
		if sk := strings.TrimSpace(in.SeedKey); sk != "" {
			seedScope = sk
		}
		if rn := strings.TrimSpace(in.RefreshNonce); rn != "" {
			seedScope += "|" + rn
		}
		retrieveIn.RandSeed = suggestionSeed(seedScope, effectiveMeal, planNow)
	}
	globalStars, _ := services.LoadGlobalStarCounts(db)
	var userStarred map[string]bool
	if !in.Global && userID != "" {
		userStarred, _ = services.LoadUserStarredDishes(db, userID)
	}
	retrieveIn.GlobalStarCounts = globalStars
	candidates := services.RetrieveDishes(retrieveIn)

	if !in.Global && !in.MealOfDayForUser && len(inventory) == 0 && category != "daily" {
		return SmartMealsResponse{
			Categories:    []MealCategory{},
			InventoryUsed: 0,
			GeneratedAt:   time.Now().Format(time.RFC3339),
			Source:        "ai",
		}, nil
	}

	source := "ai"
	var meals []MealCategory
	var err error
	if len(candidates) == 0 {
		source = "fallback"
		meals = fallbackMeals(inventory)
	} else {
		prompt := buildGroqFilterPrompt(inventory, userPrefs, userPrompt, category, effectiveMeal, recentDishes, candidates, in.Exclude, retrieveIn.GlobalStarCounts, expiringNames)
		prompt += mealVarietySuffix(candidates, userPrompt, in.Exclude)
		meals, err = callLLMFilterMeals(cfg, prompt)
		if err == nil {
			meals = finalizeMealCategories(meals, category, userPrompt, candidates, inventory, expiringNames, in.Exclude, globalStars, userStarred)
		}
	}
	if err != nil {
		source = "fallback"
		if len(candidates) > 0 {
			meals = fallbackMealsFromCandidates(candidates, category, inventory, expiringNames, userPrompt, in.Exclude, globalStars, userStarred)
		} else {
			meals = fallbackMeals(inventory)
		}
	}

	if in.Global {
		meals = relabelAsGlobalMealOfDay(meals, globalStars)
	} else if !in.MealOfDayForUser {
		recordMealSuggestions(ctx, cookedLog, userID, meals)
	}
	return SmartMealsResponse{
		Categories:    meals,
		InventoryUsed: len(inventory),
		GeneratedAt:   time.Now().Format(time.RFC3339),
		Source:        source,
	}, nil
}

func relabelAsGlobalMealOfDay(categories []MealCategory, globalStars map[string]int) []MealCategory {
	cat := pickMealOfDayCategory(categories)
	if cat == nil {
		return nil
	}
	meta := categoryMeta[services.MealOfDayCategoryID]
	cat.ID = services.MealOfDayCategoryID
	cat.Title = meta.Title
	cat.Description = meta.Desc
	for i := range cat.Meals {
		if cat.Meals[i].WhyThisMeal == "" {
			cat.Meals[i].WhyThisMeal = "Today's pick for every Rasoibuddy home."
		}
		key := services.NormalizeDishName(cat.Meals[i].Name)
		if globalStars != nil {
			cat.Meals[i].StarCount = globalStars[key]
		}
		cat.Meals[i].UserStarred = false
		enrichSmartMealDishID(&cat.Meals[i])
		enrichSmartMealIngredientIDs(&cat.Meals[i])
		enrichSmartMealPairIngredients(&cat.Meals[i])
		enrichSmartMealGroceryLines(&cat.Meals[i])
	}
	return []MealCategory{*cat}
}

func GetSmartMeals(db *sql.DB, cfg *config.Config, cookedLog *services.CookedLogService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		userPrompt := r.URL.Query().Get("prompt")
		category := r.URL.Query().Get("category")
		mealType := r.URL.Query().Get("meal_type")
		exclude := parseExcludeDishes(r.URL.Query().Get("exclude"))
		effectiveMeal := services.ResolveEffectiveMealTypeFilter(mealType, userPrompt)
		log.Printf("SmartMeals request: userID=%s, category=%q, mealType=%q (effective=%q), userPrompt=%q, exclude=%v",
			userID, category, mealType, effectiveMeal, userPrompt, exclude)

		if !requireMealCategory(db, userID, category, w) {
			return
		}
		if category == services.MealOfDayCategoryID {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "use_meal_of_day_endpoint",
				"message": "Meal of the Day is served from the nightly cache. Use GET /meals/meal-of-day.",
			})
			return
		}

		resp, err := generateSmartMeals(r.Context(), db, cfg, cookedLog, smartMealsGenerateInput{
			UserID:     userID,
			Category:   category,
			MealType:   mealType,
			UserPrompt: userPrompt,
			Exclude:    exclude,
		})
		if err != nil {
			http.Error(w, "Failed to generate meals", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func recordMealSuggestions(ctx context.Context, cookedLog *services.CookedLogService, userID string, categories []MealCategory) {
	if cookedLog == nil {
		return
	}
	seen := map[string]bool{}
	for _, cat := range categories {
		for _, meal := range cat.Meals {
			name := strings.TrimSpace(meal.Name)
			if name == "" {
				continue
			}
			key := services.NormalizeDishName(name)
			if seen[key] {
				continue
			}
			seen[key] = true
			cookedLog.LogDishName(ctx, userID, name, services.CookedSourceMealSuggested)
		}
	}
}

type inventoryRow struct {
	Name         string
	IngredientID string
	Qty          float64
	Unit         string
	Expiry       *time.Time
}

func fetchUserInventory(db *sql.DB, userID string) []inventoryRow {
	kitchen, err := resolveKitchenForUser(db, userID)
	if err != nil {
		log.Printf("fetchUserInventory kitchen lookup error: %v", err)
		return nil
	}
	if kitchen == nil {
		return nil
	}
	return fetchUserInventoryForKitchen(db, kitchen.KitchenID)
}

func fetchUserInventoryForKitchen(db *sql.DB, kitchenID string) []inventoryRow {
	kitchenID = strings.TrimSpace(kitchenID)
	if kitchenID == "" {
		return nil
	}
	rows, err := db.Query(`
		SELECT canonical_name, MAX(ingredient_id), SUM(qty) as qty, unit, MIN(estimated_expiry) as estimated_expiry
		FROM inventory
		WHERE kitchen_id = $1 AND qty > 0
		GROUP BY canonical_name, unit, COALESCE(ingredient_id, '')
		ORDER BY MIN(estimated_expiry) ASC NULLS LAST
	`, kitchenID)
	if err != nil {
		log.Printf("fetchUserInventory error: %v", err)
		return nil
	}
	defer rows.Close()

	var items []inventoryRow
	for rows.Next() {
		var item inventoryRow
		var expiry sql.NullTime
		var ingID sql.NullString
		if err := rows.Scan(&item.Name, &ingID, &item.Qty, &item.Unit, &expiry); err != nil {
			continue
		}
		if expiry.Valid {
			item.Expiry = &expiry.Time
		}
		if ingID.Valid {
			item.IngredientID = ingID.String
		}
		items = append(items, item)
	}
	return items
}

func fetchUserCookProfile(db *sql.DB, userID string) *services.CookProfileData {
	var cp services.CookProfileData
	err := db.QueryRow(`
		SELECT COALESCE(cook_name, ''), dishes_known, preferred_lang
		FROM cook_profile
		WHERE user_id = $1
	`, userID).Scan(&cp.CookName, pq.Array(&cp.DishesKnown), &cp.PreferredLang)
	if err != nil {
		return nil
	}
	return &cp
}

func fetchUserPreferences(db *sql.DB, userID string) *services.UserPrefsData {
	var up services.UserPrefsData
	var householdSize sql.NullInt64
	var spiceLevel, cookingSkill sql.NullString
	err := db.QueryRow(`
		SELECT dislikes, dietary_tags, fav_cuisines,
			COALESCE(allergies, '{}'), COALESCE(household_size, 2),
			COALESCE(spice_level, 'medium'), COALESCE(cooking_skill, 'intermediate')
		FROM user_prefs
		WHERE user_id = $1
	`, userID).Scan(pq.Array(&up.Dislikes), pq.Array(&up.DietaryTags), pq.Array(&up.FavCuisines),
		pq.Array(&up.Allergies), &householdSize, &spiceLevel, &cookingSkill)
	if err != nil {
		log.Printf("fetchUserPreferences error for %s: %v", userID, err)
		return nil
	}
	log.Printf("User prefs loaded: dietary=%v, allergies=%v, dislikes=%v, cuisines=%v", up.DietaryTags, up.Allergies, up.Dislikes, up.FavCuisines)
	if householdSize.Valid {
		up.HouseholdSize = int(householdSize.Int64)
	}
	if spiceLevel.Valid {
		up.SpiceLevel = spiceLevel.String
	}
	if cookingSkill.Valid {
		up.CookingSkill = cookingSkill.String
	}

	rows, err := db.Query(`SELECT content FROM user_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var content string
			if rows.Scan(&content) == nil {
				up.Memories = append(up.Memories, content)
			}
		}
	}
	return &up
}

// trimInventoryForMealPrompt caps list size (inventory is already sorted by expiry).
func trimInventoryForMealPrompt(items []inventoryRow) []inventoryRow {
	if len(items) <= maxInventoryInMealPrompt {
		return items
	}
	return items[:maxInventoryInMealPrompt]
}

func parseExcludeDishes(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// buildGroqFilterPrompt is stage 2 only: prefs/memories/prompt were already used in word-match retrieval.
func buildGroqFilterPrompt(inventory []inventoryRow, prefs *services.UserPrefsData, userPrompt string, category string, mealTypeFilter string, recentDishes []string, candidates []services.RankedDish, exclude []string, globalStars map[string]int, expiringNames []string) string {
	var sb strings.Builder

	if category != "" {
		meta, ok := categoryMeta[category]
		if !ok {
			meta = categoryMeta["meal_of_day"]
			category = "meal_of_day"
		}
		sb.WriteString(fmt.Sprintf("Stage 2 — filter shortlist for \"%s\" (%s). Pick exactly ONE best dish from the list only; do not add new dish names.\n", meta.Title, meta.Desc))
	} else {
		sb.WriteString("Stage 2 — filter shortlist into 6 categories. Use only candidate dish names.\n")
	}

	shortlistInv := []string(nil)
	shortlistExpiring := []string(nil)
	if category == "rescue_meal" {
		shortlistInv = inventoryNames(inventory)
		shortlistExpiring = expiringNames
	}
	sb.WriteString(services.FormatCandidateList(candidates, globalStars, category, shortlistInv, shortlistExpiring))
	sb.WriteString(fmt.Sprintf("Meal slot: prefer %s.\n", services.MealTypeFilterLabel(mealTypeFilter)))
	if category == "most_healthy" {
		sb.WriteString("Prefer higher healthy: scores in the shortlist.\n")
	}
	if category == "most_tasty" {
		sb.WriteString("Prefer higher tasty: scores in the shortlist.\n")
	}
	ctx := services.DeriveSuggestionContext(time.Now(), category)
	if ctx.WeekdayMode {
		sb.WriteString(fmt.Sprintf("Context: weekday home cooking — prefer weekday-friendly dishes under ~%d minutes, low/medium effort.\n", ctx.MaxCookMins))
	} else {
		sb.WriteString("Context: weekend — slightly more ambitious dishes are OK.\n")
	}
	sb.WriteString("Use the exact shortlist dish name in JSON. Star counts are global (all Rasoibuddy users). Prefer dishes with more stars when the request is vague.\n")

	appendHardConstraints(&sb, prefs)

	if len(recentDishes) > 0 {
		sb.WriteString("Avoid repeating: " + strings.Join(recentDishes, ", ") + "\n")
	}

	now := time.Now()
	if category == "rescue_meal" && len(expiringNames) > 0 {
		sb.WriteString("URGENT — expiring inventory (MUST use these first):\n")
		for _, item := range inventory {
			if !isExpiringInventoryItem(item, now) {
				continue
			}
			tag := expiryTag(item, now)
			sb.WriteString(fmt.Sprintf("- %s %.0f %s%s\n", item.Name, item.Qty, item.Unit, tag))
		}
		sb.WriteString("Pick a shortlist dish whose recipe ingredients use as many expiring items as possible. items_to_order MUST be [].\n")
	}
	if category == "rescue_meal" && len(inventory) > 0 {
		sb.WriteString("Pantry (inventory context):\n")
		n := 0
		for _, item := range inventory {
			if n >= maxInventoryInGroqPrompt {
				break
			}
			sb.WriteString(fmt.Sprintf("- %s %.0f %s%s\n", item.Name, item.Qty, item.Unit, expiryTag(item, now)))
			n++
		}
	}

	if category != "" {
		meta := categoryMeta[category]
		sb.WriteString("Rule: " + meta.Rule + "\n")
	}

	if userPrompt != "" {
		sb.WriteString("User request (must respect): \"" + userPrompt + "\"\n")
		sb.WriteString("The single meal MUST match the user request (same main ingredient or dish). Do not suggest unrelated dishes.\n")
	}
	if len(exclude) > 0 {
		sb.WriteString("Do NOT pick these dishes (user already saw them): " + strings.Join(exclude, ", ") + "\n")
	}

	if category != "" {
		meta := categoryMeta[category]
		sb.WriteString(fmt.Sprintf(`Return JSON array with 1 object, exactly 1 meal in "meals". "name" must copy a shortlist dish exactly:
[{"id":"%s","title":"%s","description":"%s","meals":[{"name":"","description":"1 line","ingredients":[],"items_to_order":[],"cooking_time_mins":30,"difficulty":"easy","why_this_meal":"short"}]}]
"ingredients" = main recipe ingredients for that dish (from shortlist), NOT the full pantry list.`, category, meta.Title, meta.Desc))
	} else {
		sb.WriteString(`Return JSON array, 6 category objects, exactly 1 meal each; names from shortlist only.`)
	}
	sb.WriteString(" JSON only.")
	return sb.String()
}

func appendHardConstraints(sb *strings.Builder, prefs *services.UserPrefsData) {
	if prefs == nil {
		return
	}
	var hard []string
	for _, tag := range prefs.DietaryTags {
		lower := strings.ToLower(tag)
		if strings.Contains(lower, "vegetarian") || strings.Contains(lower, "vegan") {
			hard = append(hard, "No meat/fish/eggs")
		} else if strings.Contains(lower, "jain") {
			hard = append(hard, "Jain: no meat/eggs/onion/garlic/root veg")
		}
	}
	if len(prefs.Allergies) > 0 {
		hard = append(hard, "Allergies: "+strings.Join(prefs.Allergies, ", "))
	}
	if len(hard) > 0 {
		sb.WriteString("MUST: " + strings.Join(hard, "; ") + "\n")
	}
}

func mealVarietySuffix(candidates []services.RankedDish, userPrompt string, exclude []string) string {
	pool := services.MatchingCandidatesForPrompt(candidates, userPrompt, exclude)
	if len(pool) == 0 {
		pool = services.MatchingCandidatesForPrompt(candidates, userPrompt, nil)
	}
	n := len(pool)
	if n == 0 {
		n = len(candidates)
	}
	return fmt.Sprintf("\nVary your pick across the shortlist (%d eligible dishes; run %d).", n, time.Now().UnixNano())
}

func callGeminiForMeals(cfg *config.Config, prompt string) ([]MealCategory, error) {
	if cfg.GeminiAPIKey == "" {
		return nil, fmt.Errorf("Gemini API key not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := genai.NewClient(ctx, option.WithAPIKey(cfg.GeminiAPIKey))
	if err != nil {
		return nil, err
	}
	defer client.Close()

	model := client.GenerativeModel(cfg.GeminiModel)
	model.SetTemperature(1.0)
	model.SetTopP(0.98)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return nil, fmt.Errorf("Gemini API error: %w", err)
	}

	if resp.Candidates == nil || len(resp.Candidates) == 0 {
		return nil, fmt.Errorf("no response from Gemini")
	}

	var text string
	for _, part := range resp.Candidates[0].Content.Parts {
		if t, ok := part.(genai.Text); ok {
			text = string(t)
			break
		}
	}

	if len(text) > 300 {
		log.Printf("Gemini raw response (first 300 chars): %s", text[:300])
	} else {
		log.Printf("Gemini raw response: %s", text)
	}
	return parseMealCategories(text)
}

func callLLMFilterMeals(cfg *config.Config, prompt string) ([]MealCategory, error) {
	switch cfg.LLMProvider {
	case "gemini":
		return callGeminiForMeals(cfg, prompt)
	default:
		return callGroqFilterMeals(cfg, prompt)
	}
}

func callGroqFilterMeals(cfg *config.Config, prompt string) ([]MealCategory, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	text, err := services.GroqChatFilterMeals(ctx, cfg.PickGroqAPIKey(), cfg.EffectiveGroqModel(), prompt)
	if err != nil {
		return nil, fmt.Errorf("Groq API error: %w", err)
	}
	if len(text) > 300 {
		log.Printf("Groq raw response (first 300 chars): %s", text[:300])
	} else {
		log.Printf("Groq raw response: %s", text)
	}
	return parseMealCategories(text)
}

func parseMealCategories(raw string) ([]MealCategory, error) {
	cleaned := cleanMealJSONRaw(raw)
	if cleaned == "" {
		return nil, fmt.Errorf("JSON parse error: empty response")
	}

	var categories []MealCategory
	if err := json.Unmarshal([]byte(cleaned), &categories); err == nil && len(categories) > 0 {
		return categories, nil
	}

	if salvaged, ok := salvageMealCategories(cleaned); ok {
		log.Printf("meal suggestion: salvaged %d categor(ies) from truncated/malformed JSON", len(salvaged))
		return salvaged, nil
	}

	return nil, fmt.Errorf("JSON parse error: could not parse meal JSON (raw: %.200s)", cleaned)
}

func cleanMealJSONRaw(raw string) string {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)
	start := strings.Index(cleaned, "[")
	end := strings.LastIndex(cleaned, "]")
	if start != -1 && end > start {
		cleaned = cleaned[start : end+1]
	} else if start != -1 {
		cleaned = cleaned[start:]
	}
	return cleaned
}

// salvageMealCategories repairs truncated Groq JSON (common when max_tokens cuts the reply).
func salvageMealCategories(cleaned string) ([]MealCategory, bool) {
	suffixes := []string{
		"]",
		"}]",
		"}]}",
		"\"}]}",
		"\"}]}]",
		"\"}]}]}",
		"\"}]}]}]",
	}
	for _, suf := range suffixes {
		var categories []MealCategory
		if err := json.Unmarshal([]byte(cleaned+suf), &categories); err == nil && len(categories) > 0 && len(categories[0].Meals) > 0 {
			return categories, true
		}
	}

	// Extract the first top-level category object if the outer array is broken.
	objStart := strings.Index(cleaned, "{")
	if objStart == -1 {
		return nil, false
	}
	fragment := cleaned[objStart:]
	for _, suf := range suffixes {
		var cat MealCategory
		if err := json.Unmarshal([]byte(fragment+suf), &cat); err == nil && cat.ID != "" && len(cat.Meals) > 0 {
			return []MealCategory{cat}, true
		}
	}
	return nil, false
}

var nonVegKeywords = []string{
	"chicken", "mutton", "lamb", "fish", "prawn", "shrimp", "crab", "lobster",
	"pork", "beef", "bacon", "ham", "sausage", "salami", "turkey", "duck",
	"meat", "keema", "egg", "eggs", "seafood", "tuna", "salmon", "sardine",
	"anchovy", "squid", "octopus", "venison", "goat",
}

func filterInventoryByDiet(inventory []inventoryRow, dietaryTags []string) []inventoryRow {
	isVeg := false
	for _, tag := range dietaryTags {
		lower := strings.ToLower(tag)
		if strings.Contains(lower, "vegetarian") || strings.Contains(lower, "vegan") || strings.Contains(lower, "jain") {
			isVeg = true
			break
		}
	}
	if !isVeg {
		return inventory
	}

	filtered := make([]inventoryRow, 0, len(inventory))
	for _, item := range inventory {
		nameLower := strings.ToLower(item.Name)
		skip := false
		for _, kw := range nonVegKeywords {
			if strings.Contains(nameLower, kw) {
				log.Printf("Filtered out non-veg item %q for vegetarian user", item.Name)
				skip = true
				break
			}
		}
		if !skip {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

const maxMealsPerCategory = 1

// finalizeMealCategories keeps one meal per category; randomizes within the prompt-matched shortlist.
func finalizeMealCategories(categories []MealCategory, category, userPrompt string, candidates []services.RankedDish, inventory []inventoryRow, expiringNames []string, exclude []string, globalStars map[string]int, userStarred map[string]bool) []MealCategory {
	out := make([]MealCategory, 0, len(categories))
	for _, cat := range categories {
		catID := cat.ID
		if catID == "" {
			catID = category
		}
		var meals []SmartMeal
		if pick, ok := services.RandomCandidateForPrompt(candidates, userPrompt, exclude); ok {
			dish := services.ResolveFamilyVariantByInventory(pick.Dish, inventoryNames(inventory), inventoryIngredientIDs(inventory))
			meal := smartMealFromCatalog(dish, inventory, expiringNames, catID, globalStars, userStarred)
			if groq := firstGroqMealMatching(cat.Meals, userPrompt, pick.Dish.Name); groq != nil {
				meal = mergeGroqMeal(meal, *groq)
			}
			meals = []SmartMeal{meal}
		} else if len(cat.Meals) > 0 {
			meals = cat.Meals
			if len(meals) > maxMealsPerCategory {
				meals = meals[:maxMealsPerCategory]
			}
		}
		cat.Meals = meals
		for i := range cat.Meals {
			enrichSmartMealDishID(&cat.Meals[i])
			enrichSmartMealIngredientIDs(&cat.Meals[i])
			enrichSmartMealPairIngredients(&cat.Meals[i])
			enrichSmartMealGroceryLines(&cat.Meals[i])
		}
		out = append(out, cat)
	}
	return out
}

func firstGroqMealMatching(groqMeals []SmartMeal, userPrompt, dishName string) *SmartMeal {
	tokens := services.UserPromptTokens(userPrompt)
	target := strings.ToLower(strings.TrimSpace(dishName))
	for i := range groqMeals {
		m := &groqMeals[i]
		if strings.EqualFold(strings.TrimSpace(m.Name), dishName) {
			return m
		}
		if len(tokens) > 0 && mealNameMatchesPrompt(m.Name, tokens) && strings.Contains(strings.ToLower(m.Name), target) {
			return m
		}
	}
	return nil
}

func mergeGroqMeal(base, groq SmartMeal) SmartMeal {
	if d := strings.TrimSpace(groq.Description); d != "" {
		base.Description = d
	}
	// Keep catalog recipe ingredients; Groq often echoes the full pantry for meal_of_day.
	if len(groq.Ingredients) > 0 && len(base.Ingredients) == 0 {
		base.Ingredients = groq.Ingredients
	}
	if len(base.ItemsToOrder) == 0 && len(groq.ItemsToOrder) > 0 {
		base.ItemsToOrder = services.GroceryIngredientLines(groq.ItemsToOrder)
	}
	if groq.CookingTime > 0 {
		base.CookingTime = groq.CookingTime
	}
	if d := strings.TrimSpace(groq.Difficulty); d != "" {
		base.Difficulty = d
	}
	if w := strings.TrimSpace(groq.WhyThisMeal); w != "" {
		base.WhyThisMeal = w
	}
	if len(base.PairsWith) == 0 && len(groq.PairsWith) > 0 {
		base.PairsWith = groq.PairsWith
	}
	if len(base.PairIngredients) == 0 && len(base.PairsWith) > 0 {
		base.PairIngredients = services.PairIngredientsMap(base.PairsWith)
	}
	if n := strings.TrimSpace(groq.NutritionNotes); n != "" {
		base.NutritionNotes = n
	}
	return base
}

func filterMealsMatchingPrompt(meals []SmartMeal, tokens []string) []SmartMeal {
	if len(tokens) == 0 {
		return meals
	}
	out := make([]SmartMeal, 0, len(meals))
	for _, m := range meals {
		if mealNameMatchesPrompt(m.Name, tokens) {
			out = append(out, m)
		}
	}
	return out
}

func mealNameMatchesPrompt(name string, tokens []string) bool {
	lower := strings.ToLower(name)
	for _, t := range tokens {
		if strings.Contains(lower, t) {
			return true
		}
	}
	return false
}

// fallbackMealsFromCandidates picks one random dish from the stage-1 shortlist.
func fallbackMealsFromCandidates(candidates []services.RankedDish, category string, inventory []inventoryRow, expiringNames []string, userPrompt string, exclude []string, globalStars map[string]int, userStarred map[string]bool) []MealCategory {
	if len(candidates) == 0 {
		return fallbackMeals(inventory)
	}
	meta, ok := categoryMeta[category]
	if !ok {
		meta = categoryMeta["meal_of_day"]
		category = "meal_of_day"
	}

	pick, ok := services.RandomCandidateForPrompt(candidates, userPrompt, exclude)
	if !ok {
		pick = candidates[0]
	}
	dish := services.ResolveFamilyVariantByInventory(pick.Dish, inventoryNames(inventory), inventoryIngredientIDs(inventory))

	return []MealCategory{{
		ID:          category,
		Title:       meta.Title,
		Description: meta.Desc,
		Meals:       []SmartMeal{smartMealFromCatalog(dish, inventory, expiringNames, category, globalStars, userStarred)},
	}}
}

func inventoryNames(inventory []inventoryRow) []string {
	names := make([]string, 0, len(inventory))
	for _, item := range inventory {
		if n := strings.TrimSpace(item.Name); n != "" {
			names = append(names, n)
		}
	}
	return names
}

func inventoryIngredientIDs(inventory []inventoryRow) []string {
	ids := make([]string, 0, len(inventory))
	seen := map[string]struct{}{}
	for _, item := range inventory {
		id := strings.TrimSpace(item.IngredientID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

func haveIngredients(inventory []inventoryRow) map[string]bool {
	ids := make([]string, 0, len(inventory))
	for _, item := range inventory {
		if item.IngredientID != "" {
			ids = append(ids, item.IngredientID)
		}
	}
	return services.BuildHaveIngredientSet(ids, inventoryNames(inventory))
}

func smartMealFromCatalog(d services.CatalogDish, inventory []inventoryRow, expiringNames []string, category string, globalStars map[string]int, userStarred map[string]bool) SmartMeal {
	invNames := inventoryNames(inventory)
	have := haveIngredients(inventory)
	ing, ingIDs, itemsToOrder := catalogIngredientsForMeal(d, have, invNames, expiringNames, category)
	why := "Picked from your personalized dish shortlist."
	switch category {
	case "most_healthy":
		if d.HealthyScore > 0 {
			why = fmt.Sprintf("High healthy score (%d/100) from your shortlist.", d.HealthyScore)
		}
	case "most_tasty":
		if d.TastyScore > 0 {
			why = fmt.Sprintf("High tasty score (%d/100) from your shortlist.", d.TastyScore)
		}
	case "rescue_meal":
		if len(expiringNames) > 0 {
			if used := services.InventoryItemsUsedByDish(d, expiringNames); len(used) > 0 {
				why = fmt.Sprintf("Uses %d expiring item(s): %s.", len(used), strings.Join(used, ", "))
			}
		}
	default:
		if d.WeekdayFriendly && d.CookTimeMinutes > 0 {
			why = fmt.Sprintf("Practical weeknight option (~%d min).", d.CookTimeMinutes)
		} else if c := strings.TrimSpace(d.Cuisine); c != "" {
			why = fmt.Sprintf("From your %s shortlist.", strings.ReplaceAll(c, "-", " "))
		}
	}
	if category == "rescue_meal" && len(have) > 0 {
		match := services.MatchDishToInventory(d, have)
		if match.Coverage > 0 {
			why = fmt.Sprintf("%s %.0f%% pantry match.", why, match.Coverage*100)
		}
	}
	key := services.NormalizeDishName(d.Name)
	cookMins := d.CookTimeMinutes
	if cookMins <= 0 {
		cookMins = 30
	}
	difficulty := catalogDifficulty(d.Effort)
	pairIDs := d.PairsWith
	pairs := services.PairDisplayLabels(pairIDs)
	if len(pairs) > 6 {
		pairs = pairs[:6]
	}
	return SmartMeal{
		DishID:          d.ID,
		Name:            d.DisplayLabel(),
		Description:     "",
		Ingredients:     ing,
		IngredientIDs:   ingIDs,
		ItemsToOrder:    itemsToOrder,
		PairsWith:       pairs,
		PairIngredients: services.PairIngredientsMap(pairIDs),
		CookingTime:     cookMins,
		Difficulty:  difficulty,
		WhyThisMeal: why,
		StarCount:   d.GlobalStarCount(globalStars),
		UserStarred: userStarred[key],
	}
}

func enrichSmartMealDishID(meal *SmartMeal) {
	if meal == nil || strings.TrimSpace(meal.DishID) != "" {
		return
	}
	if dish, ok := services.FindCatalogDishByName(meal.Name); ok && strings.TrimSpace(dish.ID) != "" {
		meal.DishID = dish.ID
	}
}

func enrichSmartMealIngredientIDs(meal *SmartMeal) {
	if meal == nil || len(meal.IngredientIDs) > 0 {
		return
	}
	dishID := strings.TrimSpace(meal.DishID)
	if dishID == "" {
		if dish, ok := services.FindCatalogDishByName(meal.Name); ok {
			dishID = dish.ID
		}
	}
	if dishID == "" {
		return
	}
	dish, ok := services.FindCatalogDishByID(dishID)
	if !ok {
		return
	}
	lines := dish.CatalogIngredientLines()
	if len(lines) == 0 {
		return
	}
	n := len(lines)
	if len(meal.Ingredients) > 0 && len(meal.Ingredients) < n {
		n = len(meal.Ingredients)
	}
	if n > maxIngredientsInMeal {
		n = maxIngredientsInMeal
	}
	meal.IngredientIDs = make([]string, n)
	for i, line := range lines[:n] {
		meal.IngredientIDs[i] = strings.TrimSpace(line.IngredientID)
	}
}

func enrichSmartMealPairIngredients(meal *SmartMeal) {
	if meal == nil {
		return
	}
	enrichSmartMealPairsWith(meal)
}

// enrichSmartMealPairsWith resolves pairs_with for API responses. When pair_ingredients
// were already stored in Redis, only refresh display labels (no catalog DB lookups).
func enrichSmartMealPairsWith(meal *SmartMeal) {
	if meal == nil || len(meal.PairsWith) == 0 {
		if meal != nil {
			meal.PairIngredients = nil
		}
		return
	}
	raw := append([]string(nil), meal.PairsWith...)
	if len(meal.PairIngredients) > 0 {
		meal.PairsWith = services.PairDisplayLabels(raw)
		return
	}
	meal.PairIngredients = services.PairIngredientsMap(raw)
	meal.PairsWith = services.PairDisplayLabels(raw)
}

func enrichSmartMealGroceryLines(meal *SmartMeal) {
	if meal == nil {
		return
	}
	meal.ItemsToOrder = services.GroceryIngredientLines(meal.ItemsToOrder)
}

func catalogDifficulty(effort string) string {
	switch strings.ToLower(strings.TrimSpace(effort)) {
	case "high":
		return "hard"
	case "medium":
		return "medium"
	default:
		return "easy"
	}
}

func catalogIngredientsForMeal(d services.CatalogDish, have map[string]bool, invNames, expiringNames []string, category string) ([]string, []string, []string) {
	lines := d.CatalogIngredientLines()
	if len(lines) == 0 {
		if category == "rescue_meal" && len(invNames) > 0 {
			n := 6
			if len(invNames) < n {
				n = len(invNames)
			}
			return invNames[:n], nil, nil
		}
		return nil, nil, nil
	}

	ordered := lines
	if category == "rescue_meal" {
		ordered = orderRecipeIngredientLines(lines, invNames, expiringNames, true)
	}
	n := len(ordered)
	if n > maxIngredientsInMeal {
		n = maxIngredientsInMeal
	}
	ingredients := make([]string, n)
	ingredientIDs := make([]string, n)
	for i, line := range ordered[:n] {
		ingredients[i] = titleIngredientToken(line.Name)
		ingredientIDs[i] = strings.TrimSpace(line.IngredientID)
	}

	if category == "rescue_meal" || len(have) == 0 {
		return ingredients, ingredientIDs, nil
	}
	match := services.MatchDishToInventory(d, have)
	itemsToOrder := make([]string, 0, min(len(match.Missing), maxItemsToOrder))
	for _, missing := range match.Missing {
		itemsToOrder = append(itemsToOrder, titleIngredientToken(missing))
		if len(itemsToOrder) >= maxItemsToOrder {
			break
		}
	}
	return ingredients, ingredientIDs, itemsToOrder
}

func orderRecipeIngredientLines(lines []services.IngredientLine, invNames, expiringNames []string, rescue bool) []services.IngredientLine {
	if !rescue || len(invNames) == 0 || len(lines) == 0 {
		return lines
	}
	names := make([]string, len(lines))
	for i, line := range lines {
		names[i] = line.Name
	}
	orderedNames := orderRecipeIngredients(names, invNames, expiringNames, rescue)
	byName := map[string]services.IngredientLine{}
	for _, line := range lines {
		key := strings.ToLower(strings.TrimSpace(line.Name))
		if key != "" {
			byName[key] = line
		}
	}
	out := make([]services.IngredientLine, 0, len(orderedNames))
	for _, name := range orderedNames {
		key := strings.ToLower(strings.TrimSpace(name))
		if line, ok := byName[key]; ok {
			out = append(out, line)
			continue
		}
		out = append(out, services.IngredientLine{Name: name})
	}
	return out
}

func orderRecipeIngredients(full, invNames, expiringNames []string, rescue bool) []string {
	if !rescue || len(invNames) == 0 {
		return full
	}
	dish := services.CatalogDish{KeyIngredients: full}
	expUsed := services.InventoryItemsUsedByDish(dish, expiringNames)
	pantryUsed := services.InventoryItemsUsedByDish(dish, invNames)

	ingMatchesAny := func(ing string, names []string) bool {
		for _, n := range names {
			if services.IngredientsMatch(ing, n) {
				return true
			}
		}
		return false
	}

	var expiringFirst, inPantry, rest []string
	seen := map[string]bool{}
	appendUnique := func(dst *[]string, ing string) {
		key := strings.ToLower(strings.TrimSpace(ing))
		if key == "" || seen[key] {
			return
		}
		seen[key] = true
		*dst = append(*dst, ing)
	}
	for _, ing := range full {
		switch {
		case ingMatchesAny(ing, expUsed):
			appendUnique(&expiringFirst, ing)
		case ingMatchesAny(ing, pantryUsed):
			appendUnique(&inPantry, ing)
		default:
			appendUnique(&rest, ing)
		}
	}
	out := make([]string, 0, len(full))
	out = append(out, expiringFirst...)
	out = append(out, inPantry...)
	out = append(out, rest...)
	return out
}

func expiringInventoryNames(inventory []inventoryRow, now time.Time) []string {
	var names []string
	seen := map[string]bool{}
	for _, item := range inventory {
		if !isExpiringInventoryItem(item, now) {
			continue
		}
		name := strings.TrimSpace(item.Name)
		key := strings.ToLower(name)
		if name == "" || seen[key] {
			continue
		}
		seen[key] = true
		names = append(names, name)
	}
	return names
}

func isExpiringInventoryItem(item inventoryRow, now time.Time) bool {
	if item.Expiry == nil {
		return false
	}
	days := int(item.Expiry.Sub(now).Hours() / 24)
	return days <= expiringSoonDaysForMeals
}

func expiryTag(item inventoryRow, now time.Time) string {
	if item.Expiry == nil {
		return ""
	}
	days := int(item.Expiry.Sub(now).Hours() / 24)
	if days <= 3 {
		return fmt.Sprintf(" exp%d", days)
	}
	return ""
}

func titleIngredientToken(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func fallbackMeals(inventory []inventoryRow) []MealCategory {
	names := make([]string, 0, len(inventory))
	for _, item := range inventory {
		names = append(names, item.Name)
	}
	ingredientList := strings.Join(names, ", ")

	makeMeal := func(name, desc, why string) SmartMeal {
		return SmartMeal{
			Name:        name,
			Description: desc,
			Ingredients: names,
			CookingTime: 30,
			Difficulty:  "easy",
			WhyThisMeal: why,
		}
	}

	return []MealCategory{
		{ID: "meal_of_day", Title: "Meal of the Day", Description: "Best balanced meal for today",
			Meals: []SmartMeal{makeMeal("Mixed Vegetable Curry with Rice", "A wholesome one-pot meal", "Uses multiple items from your inventory: "+ingredientList)}},
		{ID: "most_healthy", Title: "Most Healthy", Description: "Nutrient-rich meals from what you have",
			Meals: []SmartMeal{makeMeal("Dal Tadka with Roti", "Protein-rich lentil dish", "High in protein and fiber")}},
		{ID: "most_tasty", Title: "Most Tasty", Description: "Crowd-pleasers and comfort food",
			Meals: []SmartMeal{makeMeal("Paneer Butter Masala", "Rich and creamy North Indian classic", "A family favorite")}},
		{ID: "long_lasting", Title: "Cook Now, Eat Later", Description: "Meals that store well for multiple days",
			Meals: []SmartMeal{makeMeal("Rajma (Kidney Bean Curry)", "Stores well for 3-4 days in the fridge", "Great for meal prep")}},
		{ID: "rescue_meal", Title: "Rescue Meal", Description: "Use expiring items before they go to waste",
			Meals: []SmartMeal{makeMeal("Quick Stir Fry", "Use up items before they expire", "Prevents food waste")}},
		{ID: "daily", Title: "Daily", Description: "Simple everyday dish ideas",
			Meals: []SmartMeal{makeMeal("Khichdi with Pickle", "Comforting one-pot rice and lentil meal", "Easy everyday dinner idea")}},
	}
}
