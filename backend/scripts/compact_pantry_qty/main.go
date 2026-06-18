// One-off: compact inventory/shopping qty > 999 (g→kg, ml→L).
// go run ./scripts/compact_pantry_qty/main.go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/units"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	inv, err := compactTable(ctx, db, "inventory", "item_id")
	if err != nil {
		log.Fatal("inventory:", err)
	}
	shop, err := compactTable(ctx, db, "shopping_items", "id")
	if err != nil {
		log.Fatal("shopping_items:", err)
	}
	fmt.Printf("compacted inventory=%d shopping_items=%d\n", inv, shop)
}

func compactTable(ctx context.Context, db *sql.DB, table, idCol string) (int, error) {
	query := fmt.Sprintf(`SELECT %s::text, qty, unit FROM %s WHERE qty > $1`, idCol, table)
	rows, err := db.QueryContext(ctx, query, units.MaxQty)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type row struct {
		id, unit string
		qty      float64
	}
	var pending []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.qty, &r.unit); err != nil {
			return 0, err
		}
		pending = append(pending, r)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	updated := 0
	for _, r := range pending {
		nextQty, nextUnit := units.CompactQtyUnit(r.qty, r.unit)
		if nextQty == r.qty && nextUnit == units.Normalize(r.unit) {
			continue
		}
		stmt := fmt.Sprintf(`UPDATE %s SET qty = $2, unit = $3, updated_at = CURRENT_TIMESTAMP WHERE %s = $1`, table, idCol)
		if table == "shopping_items" {
			stmt = fmt.Sprintf(`UPDATE %s SET qty = $2, unit = $3 WHERE %s = $1`, table, idCol)
		}
		res, err := db.ExecContext(ctx, stmt, r.id, nextQty, nextUnit)
		if err != nil {
			return updated, fmt.Errorf("%s %s: %w", table, r.id, err)
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			updated++
			log.Printf("%s %s: %.4g %s -> %.4g %s", table, r.id, r.qty, r.unit, nextQty, nextUnit)
		}
	}
	return updated, nil
}
