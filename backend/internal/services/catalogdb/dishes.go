package catalogdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/lib/pq"
)

// DishIngredientLine is one dish_ingredients row joined to ingredients.
type DishIngredientLine struct {
	IngredientID  string
	CanonicalName string
}

// DishRow mirrors services.CatalogDish for DB-backed catalog reads.
type DishRow struct {
	ID                 string
	Name               string
	DisplayName        string
	Cuisine            string
	Diet               string
	MealType           []string
	KeyIngredients     []string
	KeyIngredientIDs   []string
	KeyIngredientLines []DishIngredientLine
	Effort          string
	CookTimeMinutes int
	WeekdayFriendly bool
	OnePot          bool
	PairsWith       []string
	FrequencyClass  string
	HalfLifeDays    int
	Tags            []string
	SpiceLevel      string
	Allergens       []string
	JainSafe        bool
	HealthyScore    int
	TastyScore      int
}

var (
	dishCache     []DishRow
	dishCacheOnce sync.Once
	dishCacheErr  error
)

// LoadDishes returns all verified dishes with key ingredient display names.
func LoadDishes(ctx context.Context, conn *sql.DB) ([]DishRow, error) {
	if conn == nil {
		return nil, fmt.Errorf("catalogdb: no database connection")
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT d.id, d.name, COALESCE(d.display_name, d.name), COALESCE(d.cuisine,''),
			COALESCE(d.diet,''), d.meal_type, COALESCE(d.effort,''), COALESCE(d.cook_time_minutes,0),
			d.weekday_friendly, d.one_pot, d.pairs_with, COALESCE(d.frequency_class,''),
			COALESCE(d.half_life_days,0), d.tags, COALESCE(d.spice_level,''), d.allergens,
			d.jain_safe, COALESCE(d.healthy_score,0), COALESCE(d.tasty_score,0)
		FROM dishes d
		WHERE d.verified = true
		ORDER BY d.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ingredientsByDish, err := loadDishIngredients(ctx, conn)
	if err != nil {
		return nil, err
	}

	var out []DishRow
	for rows.Next() {
		var d DishRow
		if err := rows.Scan(&d.ID, &d.Name, &d.DisplayName, &d.Cuisine, &d.Diet,
			pq.Array(&d.MealType), &d.Effort, &d.CookTimeMinutes, &d.WeekdayFriendly, &d.OnePot,
			pq.Array(&d.PairsWith), &d.FrequencyClass, &d.HalfLifeDays, pq.Array(&d.Tags),
			&d.SpiceLevel, pq.Array(&d.Allergens), &d.JainSafe, &d.HealthyScore, &d.TastyScore); err != nil {
			return nil, err
		}
		lines := ingredientsByDish[d.ID]
		d.KeyIngredientLines = lines
		d.KeyIngredients = make([]string, len(lines))
		d.KeyIngredientIDs = make([]string, len(lines))
		for i, line := range lines {
			d.KeyIngredients[i] = line.CanonicalName
			d.KeyIngredientIDs[i] = line.IngredientID
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func loadDishIngredients(ctx context.Context, conn *sql.DB) (map[string][]DishIngredientLine, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT di.dish_id, di.ingredient_id, i.canonical_name
		FROM dish_ingredients di
		JOIN ingredients i ON i.id = di.ingredient_id
		ORDER BY di.dish_id, di.sort_order
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]DishIngredientLine{}
	for rows.Next() {
		var dishID, ingID, name string
		if err := rows.Scan(&dishID, &ingID, &name); err != nil {
			return nil, err
		}
		out[dishID] = append(out[dishID], DishIngredientLine{
			IngredientID:  ingID,
			CanonicalName: name,
		})
	}
	return out, rows.Err()
}

// CachedDishes loads dishes once per process (invalidated only on restart).
func CachedDishes(ctx context.Context) ([]DishRow, error) {
	if db == nil {
		return nil, fmt.Errorf("catalogdb: database not initialized")
	}
	dishCacheOnce.Do(func() {
		dishCache, dishCacheErr = LoadDishes(ctx, db)
	})
	return dishCache, dishCacheErr
}

// FindDishByID returns one dish row.
func FindDishByID(ctx context.Context, conn *sql.DB, id string) (DishRow, bool, error) {
	all, err := CachedDishes(ctx)
	if err != nil {
		return DishRow{}, false, err
	}
	id = strings.TrimSpace(id)
	for _, d := range all {
		if d.ID == id {
			return d, true, nil
		}
	}
	return DishRow{}, false, nil
}

// InvalidateDishCache clears the in-memory dish cache (after reseed).
func InvalidateDishCache() {
	dishCacheOnce = sync.Once{}
	dishCache = nil
	dishCacheErr = nil
}

// DishMetadataJSON extracts onion_garlic from metadata if present.
func DishMetadataJSON(meta json.RawMessage) bool {
	var m map[string]any
	if json.Unmarshal(meta, &m) != nil {
		return false
	}
	v, _ := m["onion_garlic"].(bool)
	return v
}
