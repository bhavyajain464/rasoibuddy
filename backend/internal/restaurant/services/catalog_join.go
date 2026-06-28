package services

// Shared home-kitchen ingredients catalog (ingredients + ingredient_aliases), not restaurant_ingredients.

func inventoryCatalogJoin() string {
	return `LEFT JOIN LATERAL (
		SELECT COALESCE(NULLIF(TRIM(ing.metadata->>'food_group'), ''), 'other') AS food_group
		FROM ingredient_aliases ia
		JOIN ingredients ing ON ing.id = ia.ingredient_id
		WHERE ing.verified = true
		  AND ia.normalized = lower(unaccent(trim(i.canonical_name)))
		ORDER BY ia.is_ambiguous ASC
		LIMIT 1
	) ri ON true`
}

func shoppingCatalogJoin() string {
	return `LEFT JOIN LATERAL (
		SELECT COALESCE(NULLIF(TRIM(ing.metadata->>'food_group'), ''), 'other') AS food_group
		FROM ingredient_aliases ia
		JOIN ingredients ing ON ing.id = ia.ingredient_id
		WHERE ing.verified = true
		  AND ia.normalized = lower(unaccent(trim(si.name)))
		ORDER BY ia.is_ambiguous ASC
		LIMIT 1
	) ri ON true`
}
