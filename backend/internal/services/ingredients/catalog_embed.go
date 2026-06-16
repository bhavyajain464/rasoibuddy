package ingredients

import _ "embed"

// Authored catalog JSON — used by cmd/seedcatalog only; runtime reads Postgres.
//
//go:embed catalog.json
var catalogJSON []byte

// CatalogJSON returns the authored ingredient catalog bytes for seeding.
func CatalogJSON() []byte {
	return catalogJSON
}
