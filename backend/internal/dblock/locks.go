package dblock

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// LockInventoryItem blocks other writers on one inventory row until the transaction commits.
func LockInventoryItem(tx *sql.Tx, itemID, kitchenID string) error {
	var locked string
	return tx.QueryRow(`
		SELECT item_id::text
		FROM inventory
		WHERE item_id = $1 AND kitchen_id = $2
		FOR UPDATE
	`, itemID, kitchenID).Scan(&locked)
}

// LockInventoryItems blocks other writers on the given inventory rows.
func LockInventoryItems(tx *sql.Tx, itemIDs []string) error {
	if len(itemIDs) == 0 {
		return nil
	}
	rows, err := tx.Query(`
		SELECT item_id::text
		FROM inventory
		WHERE item_id = ANY($1::uuid[])
		FOR UPDATE
	`, pq.Array(itemIDs))
	if err != nil {
		return err
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		n++
	}
	return rows.Err()
}

// LockKitchenProductLine serializes bill-scan merge/insert for the same name+unit in a kitchen.
func LockKitchenProductLine(tx *sql.Tx, kitchenID, name, unit string) error {
	key := fmt.Sprintf("%s\x00%s\x00%s", kitchenID, strings.ToLower(strings.TrimSpace(name)), strings.TrimSpace(unit))
	_, err := tx.Exec(`SELECT pg_advisory_xact_lock(hashtext($1))`, key)
	return err
}

// FindInventoryItemIDForProduct returns one matching row id, locking it when found.
func FindInventoryItemIDForProduct(tx *sql.Tx, kitchenID, name, unit string) (string, error) {
	var id string
	err := tx.QueryRow(`
		SELECT item_id::text
		FROM inventory
		WHERE kitchen_id = $1
		  AND LOWER(canonical_name) = LOWER($2)
		  AND unit = $3
		LIMIT 1
		FOR UPDATE
	`, kitchenID, name, unit).Scan(&id)
	return id, err
}

// LockShoppingItem blocks other writers on one shopping list row.
func LockShoppingItem(tx *sql.Tx, itemID, kitchenID string) error {
	var locked string
	return tx.QueryRow(`
		SELECT id::text
		FROM shopping_items
		WHERE id = $1 AND kitchen_id = $2
		FOR UPDATE
	`, itemID, kitchenID).Scan(&locked)
}

// LockShoppingItems blocks other writers on shopping rows in a kitchen by id.
func LockShoppingItems(tx *sql.Tx, kitchenID string, itemIDs []string) error {
	if len(itemIDs) == 0 {
		return nil
	}
	rows, err := tx.Query(`
		SELECT id::text
		FROM shopping_items
		WHERE kitchen_id = $1 AND id = ANY($2::uuid[])
		FOR UPDATE
	`, kitchenID, pq.Array(itemIDs))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
	}
	return rows.Err()
}

// LockActiveShoppingByName blocks shopping rows matching name (active only) before delete/update.
func LockActiveShoppingByName(tx *sql.Tx, kitchenID, name string) error {
	rows, err := tx.Query(`
		SELECT id::text
		FROM shopping_items
		WHERE kitchen_id = $1
		  AND LOWER(name) = LOWER($2)
		  AND bought = FALSE
		FOR UPDATE
	`, kitchenID, name)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
	}
	return rows.Err()
}

// LockBoughtShoppingItems blocks all bought rows in a kitchen before bulk delete.
func LockBoughtShoppingItems(tx *sql.Tx, kitchenID string) error {
	rows, err := tx.Query(`
		SELECT id::text
		FROM shopping_items
		WHERE kitchen_id = $1 AND bought = TRUE
		FOR UPDATE
	`, kitchenID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
	}
	return rows.Err()
}
