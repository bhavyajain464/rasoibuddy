package services

func catalogJoinFrom() string {
	return `FROM shopping_items si
		` + shoppingCatalogJoin()
}

func catalogJoinFoodGroupSelect() string {
	return `COALESCE(NULLIF(TRIM(ri.food_group), ''), 'other')`
}

func catalogJoinFoodGroupSortExpr() string {
	return `CASE WHEN LOWER(` + catalogJoinFoodGroupSelect() + `) = 'protein'
		THEN 'non_veg'
		ELSE LOWER(` + catalogJoinFoodGroupSelect() + `)
	END`
}

func resolveShoppingFoodGroup(catalogGroup, name string) string {
	g := normalizeInventoryFoodGroup(catalogGroup)
	if g != "other" {
		return g
	}
	return InferFoodGroupFromName(name)
}
