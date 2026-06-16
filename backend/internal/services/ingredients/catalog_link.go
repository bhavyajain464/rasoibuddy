package ingredients

import (
	"context"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
)

// WriteLink is the catalog resolution for inventory/shopping writes.
type WriteLink struct {
	CanonicalName string
	FoodGroup     string
	IngredientID  string // empty when unmatched
}

// LinkForWrite resolves a grocery name via Postgres and parks unmatched input as a candidate.
func LinkForWrite(ctx context.Context, rawName, source string) WriteLink {
	rawName = strings.TrimSpace(rawName)
	out := WriteLink{CanonicalName: rawName, FoodGroup: "other"}
	if rawName == "" {
		return out
	}
	if res, ok := ResolveCtx(ctx, rawName); ok {
		out.CanonicalName = strings.TrimSpace(res.Ingredient.Name)
		if out.CanonicalName == "" {
			out.CanonicalName = rawName
		}
		out.FoodGroup = strings.TrimSpace(res.Ingredient.FoodGroup)
		if out.FoodGroup == "" {
			out.FoodGroup = "other"
		}
		out.IngredientID = res.Ingredient.IngredientID
		return out
	}
	if conn := catalogdb.DB(); conn != nil {
		_ = catalogdb.RecordCandidate(ctx, conn, rawName, source)
	}
	return out
}

// IngredientIDParam returns nil for SQL when ingredient_id is unset.
func (w WriteLink) IngredientIDParam() interface{} {
	if strings.TrimSpace(w.IngredientID) == "" {
		return nil
	}
	return w.IngredientID
}
