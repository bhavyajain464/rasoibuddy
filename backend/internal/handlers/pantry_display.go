package handlers

import (
	"kitchenai-backend/internal/models"
	"kitchenai-backend/internal/services/ingredients"
)

func toItemCatalog(c *ingredients.CatalogIngredient) *models.ItemCatalog {
	if c == nil {
		return nil
	}
	return &models.ItemCatalog{
		IngredientID: c.IngredientID,
		Name:         c.Name,
		DefaultUnit:  c.DefaultUnit,
		Units:        append([]string(nil), c.Units...),
		FoodGroup:    c.FoodGroup,
	}
}

func applyInventoryDisplay(item *models.Inventory) {
	d := ingredients.PantryDisplayFor(item.IngredientID, item.CanonicalName, item.FoodGroup, item.Qty, item.Unit)
	if d.IngredientID != "" {
		item.IngredientID = d.IngredientID
	}
	item.DisplayQty = d.DisplayQty
	item.Catalog = toItemCatalog(d.Catalog)
}

func applyInventoryDisplayBatch(item *models.Inventory, catalog ingredients.BatchPantryCatalog) {
	d := catalog.DisplayFor(item.IngredientID, item.CanonicalName, item.FoodGroup, item.Qty, item.Unit)
	if d.IngredientID != "" {
		item.IngredientID = d.IngredientID
	}
	item.DisplayQty = d.DisplayQty
	item.Catalog = toItemCatalog(d.Catalog)
}

func applyExpiringDisplay(item *models.ExpiringItem) {
	d := ingredients.PantryDisplayFor(item.IngredientID, item.CanonicalName, item.FoodGroup, item.Qty, item.Unit)
	if d.IngredientID != "" {
		item.IngredientID = d.IngredientID
	}
	item.DisplayQty = d.DisplayQty
	item.Catalog = toItemCatalog(d.Catalog)
}

func applyExpiringDisplayBatch(item *models.ExpiringItem, catalog ingredients.BatchPantryCatalog) {
	d := catalog.DisplayFor(item.IngredientID, item.CanonicalName, item.FoodGroup, item.Qty, item.Unit)
	if d.IngredientID != "" {
		item.IngredientID = d.IngredientID
	}
	item.DisplayQty = d.DisplayQty
	item.Catalog = toItemCatalog(d.Catalog)
}

func pantryRefsFromBuckets(resp *models.InventoryBucketsResponse) []ingredients.PantryRef {
	n := len(resp.Active) + len(resp.Expiring) + len(resp.Expired)
	if n == 0 {
		return nil
	}
	refs := make([]ingredients.PantryRef, 0, n)
	for _, item := range resp.Active {
		refs = append(refs, ingredients.PantryRef{IngredientID: item.IngredientID, Name: item.CanonicalName})
	}
	for _, item := range resp.Expiring {
		refs = append(refs, ingredients.PantryRef{IngredientID: item.IngredientID, Name: item.CanonicalName})
	}
	for _, item := range resp.Expired {
		refs = append(refs, ingredients.PantryRef{IngredientID: item.IngredientID, Name: item.CanonicalName})
	}
	return refs
}

func enrichInventoryBuckets(resp *models.InventoryBucketsResponse) {
	refs := pantryRefsFromBuckets(resp)
	if len(refs) == 0 {
		return
	}
	catalog := ingredients.NewBatchPantryCatalog(refs)
	for i := range resp.Active {
		applyInventoryDisplayBatch(&resp.Active[i], catalog)
	}
	for i := range resp.Expiring {
		applyExpiringDisplayBatch(&resp.Expiring[i], catalog)
	}
	for i := range resp.Expired {
		applyExpiringDisplayBatch(&resp.Expired[i], catalog)
	}
}

func applyShoppingDisplay(item *ShoppingItem) {
	d := ingredients.PantryDisplayFor(item.IngredientID, item.Name, "", item.Qty, item.Unit)
	if d.IngredientID != "" {
		item.IngredientID = d.IngredientID
	}
	item.DisplayQty = d.DisplayQty
	item.Catalog = toItemCatalog(d.Catalog)
}

func enrichShoppingItems(items []ShoppingItem) {
	if len(items) == 0 {
		return
	}
	refs := make([]ingredients.PantryRef, 0, len(items))
	for _, item := range items {
		refs = append(refs, ingredients.PantryRef{IngredientID: item.IngredientID, Name: item.Name})
	}
	catalog := ingredients.NewBatchPantryCatalog(refs)
	for i := range items {
		d := catalog.DisplayFor(items[i].IngredientID, items[i].Name, "", items[i].Qty, items[i].Unit)
		if d.IngredientID != "" {
			items[i].IngredientID = d.IngredientID
		}
		items[i].DisplayQty = d.DisplayQty
		items[i].Catalog = toItemCatalog(d.Catalog)
	}
}
