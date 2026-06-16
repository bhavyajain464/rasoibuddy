package ingredients

import (
	"context"
	"database/sql"

	"kitchenai-backend/internal/services/catalogdb"
)

var catalogDB *sql.DB

// InitCatalog wires Postgres as the sole runtime catalog source.
func InitCatalog(db *sql.DB) {
	catalogDB = db
	catalogdb.Init(db)
}

// dbConn returns the catalog database handle.
func dbConn() *sql.DB {
	if catalogDB != nil {
		return catalogDB
	}
	return catalogdb.DB()
}

// ResolveCtx maps a grocery name to a catalog ingredient via Postgres (pg_trgm).
func ResolveCtx(ctx context.Context, name string) (MatchResult, bool) {
	conn := dbConn()
	if conn == nil {
		return MatchResult{}, false
	}
	hit, ok, err := catalogdb.LookupIngredient(ctx, conn, name)
	if err != nil || !ok {
		return MatchResult{}, false
	}
	return MatchResult{
		Ingredient: CatalogIngredient{
			IngredientID: hit.IngredientID,
			Name:         hit.CanonicalName,
			DefaultUnit:  hit.DefaultUnit,
			Units:        hit.Units,
			FoodGroup:    hit.FoodGroup,
		},
		MatchedVia: "db",
	}, true
}

// Resolve maps a stored inventory/shopping name to a catalog ingredient.
func Resolve(name string) (MatchResult, bool) {
	return ResolveCtx(context.Background(), name)
}

// SearchCtx returns ingredients matching query (pg_trgm on aliases).
func SearchCtx(ctx context.Context, query string) []CatalogIngredient {
	conn := dbConn()
	if conn == nil {
		return nil
	}
	rows, err := catalogdb.SearchIngredients(ctx, conn, query)
	if err != nil {
		return nil
	}
	out := make([]CatalogIngredient, 0, len(rows))
	for _, r := range rows {
		out = append(out, CatalogIngredient{
			IngredientID: r.IngredientID,
			Name:         r.Name,
			DefaultUnit:  r.DefaultUnit,
			Units:        r.Units,
			FoodGroup:    r.FoodGroup,
		})
	}
	return out
}

// Search returns ingredients whose canonical name or synonyms match query.
func Search(query string) []CatalogIngredient {
	return SearchCtx(context.Background(), query)
}

// Catalog returns all ingredients sorted by name.
func Catalog() []CatalogIngredient {
	return SearchCtx(context.Background(), "")
}
