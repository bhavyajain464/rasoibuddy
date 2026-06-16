package catalogdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// LookupResult is a catalog hit from Postgres.
type LookupResult struct {
	IngredientID  string
	CanonicalName string
	FoodGroup     string
	DefaultUnit   string
	Units         []string
	Score         float64
}

// LookupIngredient resolves a raw grocery name via exact then pg_trgm fuzzy match.
func LookupIngredient(ctx context.Context, conn *sql.DB, rawName string) (LookupResult, bool, error) {
	rawName = strings.TrimSpace(rawName)
	if rawName == "" {
		return LookupResult{}, false, nil
	}
	if hit, found, ok := loadCachedName(cacheKeyName(rawName)); ok {
		return hit, found, nil
	}
	if conn == nil {
		return LookupResult{}, false, fmt.Errorf("catalogdb: no database connection")
	}

	// Exact match on non-ambiguous aliases.
	var exact LookupResult
	err := conn.QueryRowContext(ctx, `
		SELECT ia.ingredient_id, i.canonical_name,
			COALESCE(i.metadata->>'food_group', 'other'), i.default_unit, i.units
		FROM ingredient_aliases ia
		JOIN ingredients i ON i.id = ia.ingredient_id
		WHERE ia.normalized = lower(unaccent(trim($1)))
		  AND NOT ia.is_ambiguous
		LIMIT 1
	`, rawName).Scan(&exact.IngredientID, &exact.CanonicalName, &exact.FoodGroup, &exact.DefaultUnit, pqStringArray(&exact.Units))
	if err == nil {
		exact.Score = 1.0
		storeCachedName(cacheKeyName(rawName), exact, true)
		return exact, true, nil
	}
	if err != sql.ErrNoRows {
		return LookupResult{}, false, err
	}

	// Exact match when only one ingredient claims the alias (including ambiguous spellings).
	var count int
	if err := conn.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT ingredient_id)
		FROM ingredient_aliases
		WHERE normalized = lower(unaccent(trim($1)))
	`, rawName).Scan(&count); err != nil {
		return LookupResult{}, false, err
	}
	if count == 1 {
		err = conn.QueryRowContext(ctx, `
			SELECT ia.ingredient_id, i.canonical_name,
				COALESCE(i.metadata->>'food_group', 'other'), i.default_unit, i.units
			FROM ingredient_aliases ia
			JOIN ingredients i ON i.id = ia.ingredient_id
			WHERE ia.normalized = lower(unaccent(trim($1)))
			LIMIT 1
		`, rawName).Scan(&exact.IngredientID, &exact.CanonicalName, &exact.FoodGroup, &exact.DefaultUnit, pqStringArray(&exact.Units))
		if err == nil {
			exact.Score = 1.0
			storeCachedName(cacheKeyName(rawName), exact, true)
			return exact, true, nil
		}
		if err != sql.ErrNoRows {
			return LookupResult{}, false, err
		}
	}

	// Fuzzy fallback (skip ambiguous alias rows).
	var fuzzy LookupResult
	err = conn.QueryRowContext(ctx, `
		SELECT ia.ingredient_id, i.canonical_name,
			COALESCE(i.metadata->>'food_group', 'other'), i.default_unit, i.units,
			similarity(ia.normalized, lower(unaccent(trim($1)))) AS s
		FROM ingredient_aliases ia
		JOIN ingredients i ON i.id = ia.ingredient_id
		WHERE NOT ia.is_ambiguous
		  AND similarity(ia.normalized, lower(unaccent(trim($1)))) > $2
		ORDER BY s DESC
		LIMIT 1
	`, rawName, FuzzySimilarityThreshold).Scan(
		&fuzzy.IngredientID, &fuzzy.CanonicalName, &fuzzy.FoodGroup, &fuzzy.DefaultUnit,
		pqStringArray(&fuzzy.Units), &fuzzy.Score,
	)
	if err == nil {
		storeCachedName(cacheKeyName(rawName), fuzzy, true)
		return fuzzy, true, nil
	}
	if err == sql.ErrNoRows {
		storeCachedName(cacheKeyName(rawName), LookupResult{}, false)
		return LookupResult{}, false, nil
	}
	return LookupResult{}, false, err
}

func cacheKeyName(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

// LookupIngredientByID returns a catalog ingredient by stable id.
func LookupIngredientByID(ctx context.Context, conn *sql.DB, id string) (LookupResult, bool, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return LookupResult{}, false, nil
	}
	if hit, found, ok := loadCachedID(id); ok {
		return hit, found, nil
	}
	if conn == nil {
		return LookupResult{}, false, fmt.Errorf("catalogdb: no database connection")
	}
	var hit LookupResult
	err := conn.QueryRowContext(ctx, `
		SELECT id, canonical_name,
			COALESCE(metadata->>'food_group', 'other'), default_unit, units
		FROM ingredients WHERE id = $1
	`, id).Scan(&hit.IngredientID, &hit.CanonicalName, &hit.FoodGroup, &hit.DefaultUnit, pqStringArray(&hit.Units))
	if err == sql.ErrNoRows {
		storeCachedID(id, LookupResult{}, false)
		return LookupResult{}, false, nil
	}
	if err != nil {
		return LookupResult{}, false, err
	}
	hit.Score = 1.0
	storeCachedID(id, hit, true)
	return hit, true, nil
}

// LookupIngredientsByIDs loads many catalog ingredients in one query.
func LookupIngredientsByIDs(ctx context.Context, conn *sql.DB, ids []string) (map[string]LookupResult, error) {
	out := map[string]LookupResult{}
	if conn == nil {
		return out, fmt.Errorf("catalogdb: no database connection")
	}
	uniq := make([]string, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return out, nil
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT id, canonical_name,
			COALESCE(metadata->>'food_group', 'other'), default_unit, units
		FROM ingredients WHERE id = ANY($1)
	`, pq.Array(uniq))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var hit LookupResult
		if err := rows.Scan(
			&hit.IngredientID, &hit.CanonicalName, &hit.FoodGroup, &hit.DefaultUnit, pqStringArray(&hit.Units),
		); err != nil {
			return nil, err
		}
		hit.Score = 1.0
		out[hit.IngredientID] = hit
	}
	return out, rows.Err()
}

// LookupIngredientsByExactNames resolves many names via exact alias match in one query.
// Keys in the returned map are the trimmed input names. Fuzzy fallback is not included.
func LookupIngredientsByExactNames(ctx context.Context, conn *sql.DB, rawNames []string) (map[string]LookupResult, error) {
	out := map[string]LookupResult{}
	if conn == nil {
		return out, fmt.Errorf("catalogdb: no database connection")
	}
	uniq := make([]string, 0, len(rawNames))
	seen := map[string]bool{}
	for _, raw := range rawNames {
		raw = strings.TrimSpace(raw)
		if raw == "" || seen[raw] {
			continue
		}
		seen[raw] = true
		uniq = append(uniq, raw)
	}
	if len(uniq) == 0 {
		return out, nil
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT trim(n) AS raw_name, ia.ingredient_id, i.canonical_name,
			COALESCE(i.metadata->>'food_group', 'other'), i.default_unit, i.units
		FROM unnest($1::text[]) AS n
		JOIN ingredient_aliases ia
			ON ia.normalized = lower(unaccent(trim(n))) AND NOT ia.is_ambiguous
		JOIN ingredients i ON i.id = ia.ingredient_id
	`, pq.Array(uniq))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var rawName string
		var hit LookupResult
		if err := rows.Scan(
			&rawName, &hit.IngredientID, &hit.CanonicalName, &hit.FoodGroup, &hit.DefaultUnit, pqStringArray(&hit.Units),
		); err != nil {
			return nil, err
		}
		hit.Score = 1.0
		rawName = strings.TrimSpace(rawName)
		out[rawName] = hit
		storeCachedName(cacheKeyName(rawName), hit, true)
	}
	return out, rows.Err()
}

// RecordCandidate parks an unmatched name for review.
func RecordCandidate(ctx context.Context, conn *sql.DB, rawName, source string) error {
	rawName = strings.TrimSpace(rawName)
	if rawName == "" || conn == nil {
		return nil
	}
	var suggested sql.NullString
	if hit, ok, err := LookupIngredient(ctx, conn, rawName); err == nil && ok {
		suggested = sql.NullString{String: hit.IngredientID, Valid: true}
	}
	_, err := conn.ExecContext(ctx, `
		INSERT INTO ingredient_candidates (raw_name, normalized, source, suggested_id, hits)
		VALUES ($1, lower(unaccent(trim($1))), $2, $3, 1)
		ON CONFLICT (normalized) DO UPDATE SET
			hits = ingredient_candidates.hits + 1,
			source = COALESCE(EXCLUDED.source, ingredient_candidates.source),
			suggested_id = COALESCE(EXCLUDED.suggested_id, ingredient_candidates.suggested_id)
	`, rawName, source, suggested)
	return err
}
