package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/joho/godotenv"
	"kitchenai-backend/internal/db"
	invpostgres "kitchenai-backend/internal/platform/inventory/postgres"
	restaurantsvc "kitchenai-backend/internal/restaurant/services"
	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/contracts"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	database, err := db.InitDB(cfg.DatabaseURL, 4, 2, 5*time.Minute, 90*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	sqlDB := database.GetDB()
	defer sqlDB.Close()
	kid := "12ca918f-2297-4ff0-9da8-50466d2bf767"
	ctx := context.Background()

	menuSvc := restaurantsvc.NewMenuService(sqlDB)
	n, err := menuSvc.TopUpLowStock(ctx, kid)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("topped up %d inventory items\n", n)

	extID := "8207761308"
	var orderID, actorID string
	if err := sqlDB.QueryRowContext(ctx, `
		SELECT z.order_id::text, COALESCE(s.actor_user_id::text, '')
		FROM zomato_external_orders z
		LEFT JOIN zomato_kitchen_sync s ON s.kitchen_id = z.kitchen_id
		WHERE z.external_order_id = $1 AND z.kitchen_id = $2
	`, extID, kid).Scan(&orderID, &actorID); err != nil {
		return
	}
	if actorID == "" {
		fmt.Println("skip reverse: no actor_user_id")
		return
	}

	invSvc := invpostgres.New(sqlDB)
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT item_id::text, delta_qty
		FROM inventory_movements
		WHERE order_id = $1 AND reason = 'order_deduct'
	`, orderID)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	reversed := 0
	for rows.Next() {
		var itemID string
		var delta float64
		if err := rows.Scan(&itemID, &delta); err != nil {
			log.Fatal(err)
		}
		oid := orderID
		if _, err := invSvc.AdjustQty(ctx, contracts.AdjustQtyInput{
			KitchenID: kid, ItemID: itemID, ActorUserID: actorID, OrderID: &oid,
			DeltaQty: -delta, Reason: "void_reversal",
		}); err != nil {
			log.Printf("reverse %s: %v", itemID, err)
			continue
		}
		reversed++
	}
	if reversed > 0 {
		fmt.Printf("reversed %d partial deductions on order %s\n", reversed, extID)
	}
}
