package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// ImportDishRecipesStats summarizes a recipe import run.
type ImportDishRecipesStats struct {
	CatalogDishes int      `json:"catalog_dishes"`
	Matched       int      `json:"matched"`
	Unmatched     int      `json:"unmatched"`
	Upserted      int      `json:"upserted"`
	UnmatchedIDs  []string `json:"unmatched_ids,omitempty"`
}

// UpsertDishRecipe stores or updates one catalog recipe row.
func UpsertDishRecipe(ctx context.Context, conn *sql.DB, row DishRecipeRow, nutrition any) error {
	if conn == nil {
		return fmt.Errorf("dish recipe: no database connection")
	}
	dishID := strings.TrimSpace(row.DishID)
	if dishID == "" {
		return fmt.Errorf("dish_id is required")
	}
	title := strings.TrimSpace(row.Title)
	if title == "" {
		return fmt.Errorf("title is required for dish %s", dishID)
	}
	ingredients := row.Ingredients
	if ingredients == nil {
		ingredients = []string{}
	}
	instructions := row.Instructions
	if instructions == nil {
		instructions = []string{}
	}
	images := row.Images
	if images == nil {
		images = []string{}
	}
	instJSON, err := json.Marshal(instructions)
	if err != nil {
		return err
	}
	var nutritionJSON []byte
	if nutrition != nil {
		nutritionJSON, err = json.Marshal(nutrition)
		if err != nil {
			return err
		}
	}

	_, err = conn.ExecContext(ctx, `
		INSERT INTO dish_recipes (
			dish_id, source, source_url, source_recipe_id, title, description,
			prep_time_minutes, cook_time_minutes, total_time_minutes, yield,
			ingredients, instructions, images, nutrition, match_method, verified, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15,true,NOW()
		)
		ON CONFLICT (dish_id) DO UPDATE SET
			source = EXCLUDED.source,
			source_url = EXCLUDED.source_url,
			source_recipe_id = EXCLUDED.source_recipe_id,
			title = EXCLUDED.title,
			description = EXCLUDED.description,
			prep_time_minutes = EXCLUDED.prep_time_minutes,
			cook_time_minutes = EXCLUDED.cook_time_minutes,
			total_time_minutes = EXCLUDED.total_time_minutes,
			yield = EXCLUDED.yield,
			ingredients = EXCLUDED.ingredients,
			instructions = EXCLUDED.instructions,
			images = EXCLUDED.images,
			nutrition = EXCLUDED.nutrition,
			match_method = EXCLUDED.match_method,
			verified = EXCLUDED.verified,
			updated_at = NOW()
	`, dishID, nullString(row.Source), nullString(row.SourceURL), nullString(row.SourceRecipeID),
		title, nullString(row.Description),
		nullIntPtr(row.PrepTimeMinutes), nullIntPtr(row.CookTimeMinutes), nullIntPtr(row.TotalTimeMinutes),
		nullString(row.Yield),
		pq.Array(ingredients), string(instJSON), pq.Array(images),
		nullJSONBytes(nutritionJSON), nullString(row.MatchMethod))
	return err
}

func nullString(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func nullIntPtr(n int) any {
	if n <= 0 {
		return nil
	}
	return n
}

func nullJSONBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return string(b)
}

// FindDishRecipeByDishID returns one recipe for a catalog dish.
func FindDishRecipeByDishID(ctx context.Context, conn *sql.DB, dishID string) (DishRecipeRow, bool, error) {
	var row DishRecipeRow
	var ingredients []string
	var images []string
	var instructionsJSON []byte
	dishID = strings.TrimSpace(dishID)
	if dishID == "" {
		return row, false, nil
	}
	err := conn.QueryRowContext(ctx, `
		SELECT dish_id, source, COALESCE(source_url,''), COALESCE(source_recipe_id,''),
			title, COALESCE(description,''),
			COALESCE(prep_time_minutes,0), COALESCE(cook_time_minutes,0), COALESCE(total_time_minutes,0),
			COALESCE(yield,''), ingredients, instructions, images, COALESCE(match_method,'')
		FROM dish_recipes WHERE dish_id = $1
	`, dishID).Scan(
		&row.DishID, &row.Source, &row.SourceURL, &row.SourceRecipeID,
		&row.Title, &row.Description,
		&row.PrepTimeMinutes, &row.CookTimeMinutes, &row.TotalTimeMinutes,
		&row.Yield, pq.Array(&ingredients), &instructionsJSON, pq.Array(&images), &row.MatchMethod,
	)
	if err == sql.ErrNoRows {
		return row, false, nil
	}
	if err != nil {
		return row, false, err
	}
	row.Ingredients = ingredients
	row.Images = images
	if len(instructionsJSON) > 0 {
		_ = json.Unmarshal(instructionsJSON, &row.Instructions)
	}
	return row, true, nil
}

// DishRecipeSummary is a lightweight row for recipe browse/search.
type DishRecipeSummary struct {
	DishID           string `json:"dish_id"`
	DishName         string `json:"dish_name"`
	Title            string `json:"title"`
	Description      string `json:"description,omitempty"`
	PrepTimeMinutes  int    `json:"prep_time_minutes,omitempty"`
	CookTimeMinutes  int    `json:"cook_time_minutes,omitempty"`
	TotalTimeMinutes int    `json:"total_time_minutes,omitempty"`
	Yield            string `json:"yield,omitempty"`
	IngredientCount  int    `json:"ingredient_count"`
	StepCount        int    `json:"step_count"`
}

// DishRecipeListPage is a paginated recipe browse result.
type DishRecipeListPage struct {
	Items   []DishRecipeSummary `json:"items"`
	Total   int                 `json:"total"`
	Offset  int                 `json:"offset"`
	Limit   int                 `json:"limit"`
	HasMore bool                `json:"has_more"`
}

const dishRecipeListFromWhere = `
FROM dish_recipes dr
JOIN dishes d ON d.id = dr.dish_id
WHERE ($1 = '' OR dr.title ILIKE $2 OR d.name ILIKE $2
	OR COALESCE(d.display_name, '') ILIKE $2 OR dr.dish_id ILIKE $2)`

func dishRecipeSearchArgs(query string) (string, string) {
	query = strings.TrimSpace(query)
	return query, "%" + query + "%"
}

func scanDishRecipeSummaryRows(rows *sql.Rows) ([]DishRecipeSummary, error) {
	var out []DishRecipeSummary
	for rows.Next() {
		var row DishRecipeSummary
		if err := rows.Scan(
			&row.DishID, &row.DishName, &row.Title, &row.Description,
			&row.PrepTimeMinutes, &row.CookTimeMinutes, &row.TotalTimeMinutes,
			&row.Yield, &row.IngredientCount, &row.StepCount,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// ListDishRecipes returns catalog dishes that have imported recipes (legacy: up to limit rows).
func ListDishRecipes(ctx context.Context, conn *sql.DB, query string, limit int) ([]DishRecipeSummary, error) {
	if limit <= 0 {
		limit = 500
	}
	page, err := ListDishRecipesPage(ctx, conn, query, 0, limit)
	if err != nil {
		return nil, err
	}
	return page.Items, nil
}

// ListDishRecipesPage returns one page of recipe summaries plus total count.
func ListDishRecipesPage(ctx context.Context, conn *sql.DB, query string, offset, limit int) (DishRecipeListPage, error) {
	var page DishRecipeListPage
	if conn == nil {
		return page, fmt.Errorf("dish recipe: no database connection")
	}
	if limit <= 0 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	q, like := dishRecipeSearchArgs(query)

	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) `+dishRecipeListFromWhere, q, like).Scan(&page.Total); err != nil {
		return page, err
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT dr.dish_id,
			COALESCE(NULLIF(TRIM(d.display_name), ''), d.name) AS dish_name,
			dr.title,
			COALESCE(dr.description, ''),
			COALESCE(dr.prep_time_minutes, 0),
			COALESCE(dr.cook_time_minutes, 0),
			COALESCE(dr.total_time_minutes, 0),
			COALESCE(dr.yield, ''),
			COALESCE(array_length(dr.ingredients, 1), 0),
			COALESCE(jsonb_array_length(dr.instructions), 0)
		`+dishRecipeListFromWhere+`
		ORDER BY dish_name
		LIMIT $3 OFFSET $4
	`, q, like, limit, offset)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	items, err := scanDishRecipeSummaryRows(rows)
	if err != nil {
		return page, err
	}
	if items == nil {
		items = []DishRecipeSummary{}
	}
	page.Items = items
	page.Offset = offset
	page.Limit = limit
	page.HasMore = offset+len(items) < page.Total
	return page, nil
}

// ImportDishRecipesFromExternal matches catalog dishes to external recipes and upserts rows.
func ImportDishRecipesFromExternal(ctx context.Context, conn *sql.DB, catalog []CatalogDish, external []ExternalRecipe) (ImportDishRecipesStats, error) {
	var stats ImportDishRecipesStats
	if conn == nil {
		return stats, fmt.Errorf("dish recipe: no database connection")
	}
	stats.CatalogDishes = len(catalog)
	matched, unmatched := MatchCatalogDishesToRecipes(catalog, external)
	stats.Matched = len(matched)
	stats.Unmatched = len(unmatched)
	for _, m := range matched {
		row := DishRecipeRowFromMatch(m)
		if err := UpsertDishRecipe(ctx, conn, row, m.Recipe.Nutrition); err != nil {
			return stats, fmt.Errorf("upsert %s: %w", row.DishID, err)
		}
		stats.Upserted++
	}
	for _, d := range unmatched {
		stats.UnmatchedIDs = append(stats.UnmatchedIDs, d.ID)
	}
	return stats, nil
}
