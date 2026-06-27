package catalogdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// UpsertDishInput is the admin API shape for registering one catalog dish.
type UpsertDishInput struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name"`
	Cuisine         string   `json:"cuisine"`
	Diet            string   `json:"diet"`
	MealType        []string `json:"meal_type"`
	Tags            []string `json:"tags"`
	Effort          string   `json:"effort"`
	CookTimeMinutes int      `json:"cook_time_minutes"`
	WeekdayFriendly bool     `json:"weekday_friendly"`
	OnePot          bool     `json:"one_pot"`
	FrequencyClass  string   `json:"frequency_class"`
	HalfLifeDays    int      `json:"half_life_days"`
	SpiceLevel      string   `json:"spice_level"`
	HealthyScore    int      `json:"healthy_score"`
	TastyScore      int      `json:"tasty_score"`
	JainSafe        bool     `json:"jain_safe"`
	Allergens       []string `json:"allergens"`
	PairsWith       []string `json:"pairs_with"`
	Ingredients     []string `json:"ingredients"`
	KeyIngredients  []string `json:"key_ingredients"`
	DishFamily      string   `json:"dish_family"`
	VariantStyle    string   `json:"variant_style"`
}

// UpsertDish registers or updates one dish and its ingredient lines in Postgres.
func UpsertDish(ctx context.Context, conn *sql.DB, in UpsertDishInput) error {
	if conn == nil {
		return fmt.Errorf("catalogdb: no database connection")
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		id = slugify(in.Name)
	}
	if id == "" || strings.TrimSpace(in.Name) == "" {
		return fmt.Errorf("id and name are required")
	}
	display := strings.TrimSpace(in.DisplayName)
	if display == "" {
		display = strings.TrimSpace(in.Name)
	}

	tokens := in.KeyIngredients
	if len(tokens) == 0 {
		tokens = in.Ingredients
	}
	if len(tokens) == 0 {
		return fmt.Errorf("at least one ingredient is required")
	}

	idx, err := loadAliasIndex(ctx, conn)
	if err != nil {
		return fmt.Errorf("load alias index: %w", err)
	}
	stapleIDs, err := loadStapleIDs(ctx, conn)
	if err != nil {
		return fmt.Errorf("load staple ids: %w", err)
	}

	pairRegistry, err := LoadPairLabelRegistry(ctx, conn)
	if err != nil {
		return fmt.Errorf("load pair label registry: %w", err)
	}

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	normalizedPairs := make([]string, 0, len(in.PairsWith))
	seenPairs := map[string]bool{}
	for _, label := range in.PairsWith {
		label = strings.TrimSpace(label)
		if label == "" {
			continue
		}
		refID, err := resolvePairLabelForUpsert(ctx, conn, pairRegistry, idx, label)
		if err != nil {
			return err
		}
		if seenPairs[refID] {
			continue
		}
		seenPairs[refID] = true
		normalizedPairs = append(normalizedPairs, refID)
	}

	meta, _ := json.Marshal(map[string]any{
		"onion_garlic": !in.JainSafe,
	})
	dishFamily := strings.TrimSpace(in.DishFamily)
	if dishFamily == "" {
		dishFamily = id
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO dishes (id, name, display_name, cuisine, diet, meal_type, tags, effort,
			cook_time_minutes, weekday_friendly, one_pot, frequency_class, half_life_days,
			spice_level, healthy_score, tasty_score, jain_safe, allergens, pairs_with,
			verified, metadata, dish_family, variant_style, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,$20,$21,$22,NOW())
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
			dish_family = EXCLUDED.dish_family,
			variant_style = EXCLUDED.variant_style,
			updated_at = NOW()
	`, id, in.Name, display, nullIfEmpty(in.Cuisine), nullIfEmpty(in.Diet),
		pq.Array(in.MealType), pq.Array(in.Tags), nullIfEmpty(in.Effort),
		nullInt(in.CookTimeMinutes), in.WeekdayFriendly, in.OnePot,
		nullIfEmpty(in.FrequencyClass), nullInt(in.HalfLifeDays),
		nullIfEmpty(in.SpiceLevel), nullInt(in.HealthyScore), nullInt(in.TastyScore),
		in.JainSafe, pq.Array(in.Allergens), pq.Array(normalizedPairs), meta, dishFamily, nullIfEmpty(in.VariantStyle))
	if err != nil {
		return fmt.Errorf("upsert dish %q: %w", id, err)
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM dish_ingredients WHERE dish_id = $1`, id); err != nil {
		return err
	}
	for sortOrder, token := range tokens {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		ingID := idx.resolve(token)
		if ingID == "" {
			return fmt.Errorf("unresolved ingredient %q for dish %q", token, id)
		}
		isStaple := stapleIDs[ingID] || pantryStapleNames[strings.ToLower(token)]
		_, err = tx.ExecContext(ctx, `
			INSERT INTO dish_ingredients (dish_id, ingredient_id, role, is_staple, sort_order)
			VALUES ($1,$2,'main',$3,$4)
			ON CONFLICT (dish_id, ingredient_id) DO UPDATE SET is_staple = EXCLUDED.is_staple, sort_order = EXCLUDED.sort_order
		`, id, ingID, isStaple, sortOrder)
		if err != nil {
			return fmt.Errorf("dish_ingredients %s/%s: %w", id, ingID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	InvalidateDishCache()
	return nil
}

func resolvePairLabelForUpsert(ctx context.Context, conn *sql.DB, registry map[string]PairRef, idx *aliasIndex, label string) (string, error) {
	if ref, ok := registry[label]; ok {
		return ref.ID, nil
	}
	var dishExists bool
	if err := conn.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM dishes WHERE id = $1)`, label).Scan(&dishExists); err != nil {
		return "", err
	}
	if dishExists {
		return label, nil
	}
	if ingID := idx.resolve(label); ingID != "" {
		return ingID, nil
	}
	var ingExists bool
	if err := conn.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ingredients WHERE id = $1)`, label).Scan(&ingExists); err != nil {
		return "", err
	}
	if ingExists {
		return label, nil
	}
	return "", fmt.Errorf("unregistered pairs_with label %q", label)
}
