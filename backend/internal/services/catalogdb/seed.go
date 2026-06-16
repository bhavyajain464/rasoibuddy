package catalogdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/lib/pq"
	"kitchenai-backend/pkg/units"
)

// SeedStats summarizes a catalog seed run.
type SeedStats struct {
	Ingredients      int `json:"ingredients"`
	Aliases            int `json:"aliases"`
	Dishes             int `json:"dishes"`
	DishIngredients    int `json:"dish_ingredients"`
	UnresolvedDishes   []string `json:"unresolved_dishes,omitempty"`
}

type ingredientRaw struct {
	ID        string   `json:"id"`
	Canonical string   `json:"canonical"`
	Category  string   `json:"category"`
	Veg       bool     `json:"veg"`
	Units     []string `json:"units"`
	Synonyms  []string `json:"synonyms"`
}

type ingredientsFile struct {
	AmbiguousAliases map[string][]string `json:"ambiguous_aliases"`
	Ingredients      []ingredientRaw     `json:"ingredients"`
}

type dishRaw struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name"`
	Cuisine         string   `json:"cuisine"`
	Diet            string   `json:"diet"`
	MealType        []string `json:"meal_type"`
	KeyIngredients  []string `json:"key_ingredients"`
	Ingredients     []string `json:"ingredients"`
	Effort          string   `json:"effort"`
	CookTimeMinutes int      `json:"cook_time_minutes"`
	WeekdayFriendly bool     `json:"weekday_friendly"`
	OnePot          bool     `json:"one_pot"`
	PairsWith       []string `json:"pairs_with"`
	FrequencyClass  string   `json:"frequency_class"`
	HalfLifeDays    int      `json:"half_life_days"`
	Tags            []string `json:"tags"`
	SpiceLevel      string   `json:"spice_level"`
	Allergens       []string `json:"allergens"`
	JainSafe        bool     `json:"jain_safe"`
	HealthyScore    int      `json:"healthy_score"`
	TastyScore      int      `json:"tasty_score"`
}

func (d dishRaw) ingredientTokens() []string {
	if len(d.KeyIngredients) > 0 {
		return d.KeyIngredients
	}
	return d.Ingredients
}

// pantryStapleNames are assumed on hand and excluded from shopping-gap (is_staple).
var pantryStapleNames = map[string]bool{
	"salt": true, "water": true, "cooking oil": true, "oil": true, "sugar": true,
	"turmeric powder": true, "red chilli powder": true, "coriander powder": true,
	"cumin powder": true, "garam masala": true, "mustard seeds": true, "cumin seeds": true,
	"asafoetida": true, "black pepper": true, "ghee": true,
}

// SeedOptions controls which catalog phases run.
type SeedOptions struct {
	// DishesOnly skips ingredient upserts and loads the alias index from DB.
	DishesOnly bool
}

// Seed loads ingredients + dishes from JSON bytes into Postgres (idempotent upserts).
func Seed(ctx context.Context, conn *sql.DB, ingredientsJSON, dishesJSON []byte) (SeedStats, error) {
	return SeedWithOptions(ctx, conn, ingredientsJSON, dishesJSON, SeedOptions{}, os.Stderr)
}

// SeedWithLog is like Seed but writes progress to logOut.
func SeedWithLog(ctx context.Context, conn *sql.DB, ingredientsJSON, dishesJSON []byte, logOut io.Writer) (SeedStats, error) {
	return SeedWithOptions(ctx, conn, ingredientsJSON, dishesJSON, SeedOptions{}, logOut)
}

// SeedWithOptions runs the catalog seed with optional phase skipping.
func SeedWithOptions(ctx context.Context, conn *sql.DB, ingredientsJSON, dishesJSON []byte, opts SeedOptions, logOut io.Writer) (SeedStats, error) {
	progress := log.New(logOut, "[seedcatalog] ", log.LstdFlags)
	var stats SeedStats
	if conn == nil {
		return stats, fmt.Errorf("catalogdb: no database connection")
	}

	var ingFile ingredientsFile
	if err := json.Unmarshal(ingredientsJSON, &ingFile); err != nil {
		return stats, fmt.Errorf("parse ingredients catalog: %w", err)
	}
	expectedIngredients := countValidIngredients(ingFile.Ingredients)

	stapleIDs := map[string]bool{}
	skipIngredients := opts.DishesOnly
	if !skipIngredients {
		var dbCount int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM ingredients`).Scan(&dbCount); err != nil {
			return stats, err
		}
		if dbCount >= expectedIngredients && dbCount > 0 {
			skipIngredients = true
			progress.Printf("ingredients already seeded (%d >= %d json rows) — skipping", dbCount, expectedIngredients)
		}
	}

	if skipIngredients {
		var dbCount, aliasCount int
		_ = conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM ingredients`).Scan(&dbCount)
		_ = conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM ingredient_aliases`).Scan(&aliasCount)
		stats.Ingredients = dbCount
		stats.Aliases = aliasCount
		var err error
		stapleIDs, err = loadStapleIDs(ctx, conn)
		if err != nil {
			return stats, fmt.Errorf("load staple ids: %w", err)
		}
	} else {
		var err error
		stats, stapleIDs, err = seedIngredients(ctx, conn, ingFile, progress)
		if err != nil {
			return stats, err
		}
	}

	idx, err := loadAliasIndex(ctx, conn)
	if err != nil {
		return stats, fmt.Errorf("load alias index: %w", err)
	}
	progress.Printf("alias index loaded: %d entries", len(idx.entries))

	if n, err := BootstrapPairLabelAliases(ctx, conn); err != nil {
		return stats, fmt.Errorf("bootstrap pair label aliases: %w", err)
	} else if n > 0 {
		progress.Printf("bootstrapped %d pair label aliases", n)
	}

	dishStats, err := seedDishes(ctx, conn, dishesJSON, ingredientsJSON, idx, stapleIDs, progress)
	stats.Dishes = dishStats.Dishes
	stats.DishIngredients = dishStats.DishIngredients
	stats.UnresolvedDishes = dishStats.UnresolvedDishes
	if err != nil {
		return stats, err
	}
	progress.Printf("done: %d dishes, %d dish_ingredients", stats.Dishes, stats.DishIngredients)
	return stats, nil
}

func countValidIngredients(rows []ingredientRaw) int {
	n := 0
	for _, e := range rows {
		if strings.TrimSpace(e.ID) != "" && strings.TrimSpace(e.Canonical) != "" {
			n++
		}
	}
	return n
}

func loadStapleIDs(ctx context.Context, conn *sql.DB) (map[string]bool, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT id FROM ingredients WHERE restock_class = 'staple' OR default_pantry = true
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

func seedIngredients(ctx context.Context, conn *sql.DB, ingFile ingredientsFile, progress *log.Logger) (SeedStats, map[string]bool, error) {
	var stats SeedStats
	stapleIDs := map[string]bool{}

	ambiguousKeys := map[string]bool{}
	for key := range ingFile.AmbiguousAliases {
		ambiguousKeys[strings.ToLower(strings.TrimSpace(key))] = true
	}

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return stats, nil, err
	}
	defer tx.Rollback()

	for _, e := range ingFile.Ingredients {
		id := strings.TrimSpace(e.ID)
		name := strings.TrimSpace(e.Canonical)
		if id == "" || name == "" {
			continue
		}
		unitList := normalizeUnitList(e.Units)
		defaultUnit := defaultUnitForCategory(e.Category)
		if len(unitList) > 0 {
			defaultUnit = unitList[0]
		}
		foodGroup := foodGroupForCategory(e.Category)
		restock := "occasional"
		defaultPantry := false
		if pantryStapleNames[strings.ToLower(name)] {
			restock = "staple"
			defaultPantry = true
			stapleIDs[id] = true
		}
		meta, _ := json.Marshal(map[string]string{"food_group": foodGroup})

		_, err := tx.ExecContext(ctx, `
			INSERT INTO ingredients (id, canonical_name, category, veg, default_unit, units,
				restock_class, default_pantry, verified, metadata, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,NOW())
			ON CONFLICT (id) DO UPDATE SET
				canonical_name = EXCLUDED.canonical_name,
				category = EXCLUDED.category,
				veg = EXCLUDED.veg,
				default_unit = EXCLUDED.default_unit,
				units = EXCLUDED.units,
				restock_class = EXCLUDED.restock_class,
				default_pantry = EXCLUDED.default_pantry,
				metadata = EXCLUDED.metadata,
				updated_at = NOW()
		`, id, name, e.Category, e.Veg, defaultUnit, pq.Array(unitList), restock, defaultPantry, meta)
		if err != nil {
			return stats, nil, fmt.Errorf("upsert ingredient %q: %w", id, err)
		}
		stats.Ingredients++

		aliases := []string{name}
		aliases = append(aliases, e.Synonyms...)
		aliases = append(aliases, id)
		seen := map[string]bool{}
		for _, alias := range aliases {
			alias = strings.TrimSpace(alias)
			if alias == "" || seen[strings.ToLower(alias)] {
				continue
			}
			seen[strings.ToLower(alias)] = true
			isPrimary := strings.EqualFold(alias, name)
			isAmbiguous := ambiguousKeys[strings.ToLower(alias)]
			_, err := tx.ExecContext(ctx, `
				INSERT INTO ingredient_aliases (ingredient_id, alias, normalized, is_primary, is_ambiguous)
				VALUES ($1, $2, lower(unaccent(trim($2))), $3, $4)
				ON CONFLICT (normalized, ingredient_id) DO UPDATE SET
					alias = EXCLUDED.alias,
					is_primary = EXCLUDED.is_primary,
					is_ambiguous = EXCLUDED.is_ambiguous
			`, id, alias, isPrimary, isAmbiguous)
			if err != nil {
				return stats, nil, fmt.Errorf("upsert alias %q for %q: %w", alias, id, err)
			}
			stats.Aliases++
			if pantryStapleNames[strings.ToLower(alias)] {
				stapleIDs[id] = true
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return stats, nil, err
	}
	progress.Printf("ingredients done: %d rows, %d aliases", stats.Ingredients, stats.Aliases)
	return stats, stapleIDs, nil
}

func seedDishes(ctx context.Context, conn *sql.DB, dishesJSON, ingredientsJSON []byte, idx *aliasIndex, stapleIDs map[string]bool, progress *log.Logger) (SeedStats, error) {
	var stats SeedStats

	pairRegistry, err := LoadPairLabelRegistry(ctx, conn)
	if err != nil {
		return stats, fmt.Errorf("load pair label registry: %w", err)
	}
	pairResolver, err := NewPairCatalogResolver(ingredientsJSON, dishesJSON, pairRegistry)
	if err != nil {
		return stats, fmt.Errorf("pair resolver: %w", err)
	}

	var dishes []dishRaw
	if err := json.Unmarshal(dishesJSON, &dishes); err != nil {
		return stats, fmt.Errorf("parse dishes catalog: %w", err)
	}

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return stats, err
	}
	defer tx.Rollback()

	for i, d := range dishes {
		id := strings.TrimSpace(d.ID)
		if id == "" {
			id = slugify(d.Name)
		}
		if id == "" {
			continue
		}
		display := strings.TrimSpace(d.DisplayName)
		if display == "" {
			display = strings.TrimSpace(d.Name)
		}
		meta, _ := json.Marshal(map[string]any{
			"onion_garlic": !d.JainSafe,
		})

		normalizedPairs, err := pairResolver.NormalizeDishPairsWith(d.PairsWith)
		if err != nil {
			return stats, fmt.Errorf("dish %q: %w", id, err)
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO dishes (id, name, display_name, cuisine, diet, meal_type, tags, effort,
				cook_time_minutes, weekday_friendly, one_pot, frequency_class, half_life_days,
				spice_level, healthy_score, tasty_score, jain_safe, allergens, pairs_with,
				verified, metadata, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,$20,NOW())
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				display_name = EXCLUDED.display_name,
				cuisine = EXCLUDED.cuisine,
				diet = EXCLUDED.diet,
				meal_type = EXCLUDED.meal_type,
				tags = EXCLUDED.tags,
				effort = EXCLUDED.effort,
				cook_time_minutes = EXCLUDED.cook_time_minutes,
				weekday_friendly = EXCLUDED.weekday_friendly,
				one_pot = EXCLUDED.one_pot,
				frequency_class = EXCLUDED.frequency_class,
				half_life_days = EXCLUDED.half_life_days,
				spice_level = EXCLUDED.spice_level,
				healthy_score = EXCLUDED.healthy_score,
				tasty_score = EXCLUDED.tasty_score,
				jain_safe = EXCLUDED.jain_safe,
				allergens = EXCLUDED.allergens,
				pairs_with = EXCLUDED.pairs_with,
				metadata = EXCLUDED.metadata,
				updated_at = NOW()
		`, id, d.Name, display, nullIfEmpty(d.Cuisine), nullIfEmpty(d.Diet),
			pq.Array(d.MealType), pq.Array(d.Tags), nullIfEmpty(d.Effort),
			nullInt(d.CookTimeMinutes), d.WeekdayFriendly, d.OnePot,
			nullIfEmpty(d.FrequencyClass), nullInt(d.HalfLifeDays),
			nullIfEmpty(d.SpiceLevel), nullInt(d.HealthyScore), nullInt(d.TastyScore),
			d.JainSafe, pq.Array(d.Allergens), pq.Array(normalizedPairs), meta)
		if err != nil {
			return stats, fmt.Errorf("upsert dish %q: %w", id, err)
		}
		stats.Dishes++

		if _, err := tx.ExecContext(ctx, `DELETE FROM dish_ingredients WHERE dish_id = $1`, id); err != nil {
			return stats, err
		}

		for sortOrder, token := range d.ingredientTokens() {
			token = strings.TrimSpace(token)
			if token == "" {
				continue
			}
			ingID := idx.resolve(token)
			if ingID == "" {
				stats.UnresolvedDishes = append(stats.UnresolvedDishes, fmt.Sprintf("%s: %q", id, token))
				continue
			}
			isStaple := stapleIDs[ingID] || pantryStapleNames[strings.ToLower(token)]
			_, err = tx.ExecContext(ctx, `
				INSERT INTO dish_ingredients (dish_id, ingredient_id, role, is_staple, sort_order)
				VALUES ($1,$2,'main',$3,$4)
				ON CONFLICT (dish_id, ingredient_id) DO UPDATE SET is_staple = EXCLUDED.is_staple, sort_order = EXCLUDED.sort_order
			`, id, ingID, isStaple, sortOrder)
			if err != nil {
				return stats, fmt.Errorf("dish_ingredients %s/%s: %w", id, ingID, err)
			}
			stats.DishIngredients++
		}
		if (i+1)%50 == 0 || i+1 == len(dishes) {
			progress.Printf("dishes %d/%d (%d dish_ingredients, %d unresolved tokens)",
				i+1, len(dishes), stats.DishIngredients, len(stats.UnresolvedDishes))
		}
	}

	if len(stats.UnresolvedDishes) > 0 {
		return stats, fmt.Errorf("unresolved dish ingredients: %d (first: %s)", len(stats.UnresolvedDishes), stats.UnresolvedDishes[0])
	}

	if err := tx.Commit(); err != nil {
		return stats, err
	}
	return stats, nil
}

type aliasIndex struct {
	byID        map[string]string
	byNorm      map[string]string // normalized -> ingredient_id when unique non-ambiguous
	byNormCount map[string]int
	ambiguous   map[string]bool
	entries     []aliasEntry
}

type aliasEntry struct {
	norm         string
	ingredientID string
	ambiguous    bool
}

func loadAliasIndex(ctx context.Context, conn *sql.DB) (*aliasIndex, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT ingredient_id, normalized, is_ambiguous FROM ingredient_aliases
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	idx := &aliasIndex{
		byID:        map[string]string{},
		byNorm:      map[string]string{},
		byNormCount: map[string]int{},
		ambiguous:   map[string]bool{},
	}
	for rows.Next() {
		var ingID, norm string
		var amb bool
		if err := rows.Scan(&ingID, &norm, &amb); err != nil {
			return nil, err
		}
		idx.byID[strings.ToLower(strings.TrimSpace(ingID))] = ingID
		idx.entries = append(idx.entries, aliasEntry{norm: norm, ingredientID: ingID, ambiguous: amb})
		idx.byNormCount[norm]++
		if amb {
			idx.ambiguous[norm] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, e := range idx.entries {
		if e.ambiguous || idx.byNormCount[e.norm] > 1 {
			continue
		}
		idx.byNorm[e.norm] = e.ingredientID
	}
	return idx, nil
}

func (idx *aliasIndex) resolve(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	lower := strings.ToLower(token)
	if id, ok := idx.byID[lower]; ok {
		return id
	}
	if id, ok := idx.byID[strings.ReplaceAll(lower, " ", "_")]; ok {
		return id
	}
	norm := strings.ToLower(strings.TrimSpace(token))
	if id, ok := idx.byNorm[norm]; ok {
		return id
	}
	if idx.byNormCount[norm] == 1 && !idx.ambiguous[norm] {
		for _, e := range idx.entries {
			if e.norm == norm {
				return e.ingredientID
			}
		}
	}
	// Substring: longest alias contained in token (e.g. "grated paneer stuffing" → paneer).
	bestLen, bestID := 0, ""
	for _, e := range idx.entries {
		if e.ambiguous || len(e.norm) < 3 {
			continue
		}
		if strings.Contains(norm, e.norm) || strings.Contains(e.norm, norm) {
			if len(e.norm) > bestLen {
				bestLen = len(e.norm)
				bestID = e.ingredientID
			}
		}
	}
	return bestID
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "-")
	return s
}

func nullIfEmpty(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func nullInt(n int) interface{} {
	if n == 0 {
		return nil
	}
	return n
}

func defaultUnitForCategory(category string) string {
	switch strings.TrimSpace(category) {
	case "oils_fats", "beverages", "condiments_sauces":
		return "ml"
	case "vegetables", "leafy_greens", "fruits", "poultry", "meat", "seafood",
		"grains_cereals", "pulses_legumes":
		return "kg"
	case "spices", "spice_blends", "herbs", "flours", "nuts", "seeds", "dry_fruits",
		"baking", "sweeteners", "dairy":
		return "g"
	default:
		return "pcs"
	}
}

func foodGroupForCategory(category string) string {
	switch strings.TrimSpace(category) {
	case "vegetables", "leafy_greens":
		return "vegetables"
	case "fruits":
		return "fruits"
	case "spices", "spice_blends", "herbs":
		return "spices"
	case "dairy", "eggs":
		return "dairy"
	case "grains_cereals", "pulses_legumes", "flours":
		return "grains_pulses"
	case "oils_fats":
		return "oils_fats"
	case "poultry", "meat", "seafood":
		return "non_veg"
	case "condiments_sauces":
		return "condiments"
	case "baking", "staples_packaged":
		return "bakery"
	case "beverages":
		return "beverages"
	default:
		return "other"
	}
}

func normalizeUnitList(raw []string) []string {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, u := range raw {
		n := units.Normalize(strings.TrimSpace(u))
		if n == "" {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	return out
}
