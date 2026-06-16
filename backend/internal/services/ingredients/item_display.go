package ingredients

import (
	"context"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
)

// PantryDisplay is server-computed catalog + qty label for inventory/shopping rows.
type PantryDisplay struct {
	IngredientID string
	Catalog      *CatalogIngredient
	DisplayQty   string
}

// ResolveByID maps a catalog ingredient id to a catalog row.
func ResolveByID(id string) (MatchResult, bool) {
	return ResolveByIDCtx(context.Background(), id)
}

// ResolveByIDCtx maps a catalog ingredient id to a catalog row.
func ResolveByIDCtx(ctx context.Context, id string) (MatchResult, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return MatchResult{}, false
	}
	conn := dbConn()
	if conn == nil {
		return MatchResult{}, false
	}
	hit, ok, err := catalogdb.LookupIngredientByID(ctx, conn, id)
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
		MatchedVia: "db_id",
	}, true
}

// PantryRef identifies one pantry/shopping row for batch catalog resolution.
type PantryRef struct {
	IngredientID string
	Name         string
}

// BatchPantryCatalog prefetches catalog metadata for many rows (one query per ID batch).
type BatchPantryCatalog struct {
	byID   map[string]CatalogIngredient
	byName map[string]CatalogIngredient
}

// NewBatchPantryCatalog resolves unique ingredient ids and names for list endpoints.
func NewBatchPantryCatalog(refs []PantryRef) BatchPantryCatalog {
	idSet := map[string]struct{}{}
	nameSet := map[string]struct{}{}
	for _, ref := range refs {
		if id := strings.TrimSpace(ref.IngredientID); id != "" {
			idSet[id] = struct{}{}
			continue
		}
		if name := strings.TrimSpace(ref.Name); name != "" {
			nameSet[name] = struct{}{}
		}
	}

	byID := map[string]CatalogIngredient{}
	if len(idSet) > 0 {
		ids := make([]string, 0, len(idSet))
		for id := range idSet {
			ids = append(ids, id)
		}
		conn := dbConn()
		if conn != nil {
			hits, err := catalogdb.LookupIngredientsByIDs(context.Background(), conn, ids)
			if err == nil {
				for id, hit := range hits {
					byID[id] = CatalogIngredient{
						IngredientID: hit.IngredientID,
						Name:         hit.CanonicalName,
						DefaultUnit:  hit.DefaultUnit,
						Units:        hit.Units,
						FoodGroup:    hit.FoodGroup,
					}
				}
			}
		}
	}

	byName := map[string]CatalogIngredient{}
	if len(nameSet) > 0 {
		names := make([]string, 0, len(nameSet))
		for name := range nameSet {
			names = append(names, name)
		}
		conn := dbConn()
		if conn != nil {
			ctx := context.Background()
			if hits, err := catalogdb.LookupIngredientsByExactNames(ctx, conn, names); err == nil {
				for name, hit := range hits {
					byName[name] = catalogIngredientFromLookup(hit)
				}
			}
			for _, name := range names {
				if _, ok := byName[name]; ok {
					continue
				}
				if res, ok := Resolve(name); ok {
					byName[name] = res.Ingredient
				}
			}
		}
	}

	return BatchPantryCatalog{byID: byID, byName: byName}
}

func catalogIngredientFromLookup(hit catalogdb.LookupResult) CatalogIngredient {
	return CatalogIngredient{
		IngredientID: hit.IngredientID,
		Name:         hit.CanonicalName,
		DefaultUnit:  hit.DefaultUnit,
		Units:        hit.Units,
		FoodGroup:    hit.FoodGroup,
	}
}

// DisplayFor returns catalog + display qty using the prefetched maps.
func (b BatchPantryCatalog) DisplayFor(ingredientID, name, foodGroup string, qty float64, unit string) PantryDisplay {
	var cat *CatalogIngredient
	id := strings.TrimSpace(ingredientID)

	if id != "" {
		if c, ok := b.byID[id]; ok {
			cc := c
			cat = &cc
		}
	}
	if cat == nil {
		if c, ok := b.byName[strings.TrimSpace(name)]; ok {
			cc := c
			cat = &cc
			id = strings.TrimSpace(c.IngredientID)
		}
	}

	return PantryDisplay{
		IngredientID: id,
		Catalog:      cat,
		DisplayQty:   FormatPurchaseQty(qty, unit, cat),
	}
}

// PantryDisplayFor resolves catalog metadata and a display qty string for a pantry/shopping row.
func PantryDisplayFor(ingredientID, name, foodGroup string, qty float64, unit string) PantryDisplay {
	var cat *CatalogIngredient
	id := strings.TrimSpace(ingredientID)

	if id != "" {
		if res, ok := ResolveByID(id); ok {
			c := res.Ingredient
			cat = &c
		}
	}
	if cat == nil {
		if res, ok := Resolve(name); ok {
			c := res.Ingredient
			cat = &c
			id = strings.TrimSpace(c.IngredientID)
		}
	}

	displayQty := FormatPurchaseQty(qty, unit, cat)
	return PantryDisplay{
		IngredientID: id,
		Catalog:      cat,
		DisplayQty:   displayQty,
	}
}
