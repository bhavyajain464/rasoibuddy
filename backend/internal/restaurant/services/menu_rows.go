package services

const menuItemSelectSQL = `
	menu_item_id::text, kitchen_id::text, name, category, price_cents, is_active,
	COALESCE(zomato_catalogue_id, ''), COALESCE(image_url, ''),
	created_at, updated_at`

func scanMenuItem(scanner interface {
	Scan(dest ...any) error
}) (MenuItem, error) {
	var m MenuItem
	err := scanner.Scan(
		&m.MenuItemID, &m.KitchenID, &m.Name, &m.Category, &m.PriceCents, &m.IsActive,
		&m.ZomatoCatalogueID, &m.ImageURL,
		&m.CreatedAt, &m.UpdatedAt,
	)
	return m, err
}
