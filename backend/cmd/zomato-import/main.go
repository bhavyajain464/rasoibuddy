// One-off: go run ./cmd/zomato-import 8207761308 [kitchen_id]
package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"kitchenai-backend/internal/db"
	invpostgres "kitchenai-backend/internal/platform/inventory/postgres"
	"kitchenai-backend/internal/restaurant/integrations/zomato"
	restaurantsvc "kitchenai-backend/internal/restaurant/services"
	"kitchenai-backend/pkg/config"
)

func main() {
	_ = godotenv.Load()
	if len(os.Args) < 2 {
		log.Fatal("usage: go run ./cmd/zomato-import <external_order_id> [kitchen_id]")
	}
	orderID := os.Args[1]
	kitchenID := "12ca918f-2297-4ff0-9da8-50466d2bf767"
	if len(os.Args) > 2 {
		kitchenID = os.Args[2]
	}

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

	invSvc := invpostgres.New(sqlDB)
	menuSvc := restaurantsvc.NewMenuService(sqlDB, cfg)
	deductionSvc := restaurantsvc.NewDeductionEngine(invSvc)
	orderSvc := restaurantsvc.NewOrderService(sqlDB, menuSvc, deductionSvc)
	zomatoSvc := zomato.NewService(sqlDB, orderSvc, menuSvc)

	if orderID == "backfill-times" {
		n, err := zomatoSvc.BackfillPlacedTimes(context.Background(), kitchenID)
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("backfilled placed_at on %d orders", n)
		return
	}

	var actorID, outletID string
	if err := sqlDB.QueryRow(`
		SELECT COALESCE(actor_user_id::text, ''), partner_outlet_id
		FROM partner_order_sync
		WHERE kitchen_id = $1
		ORDER BY updated_at DESC
		LIMIT 1
	`, kitchenID).Scan(&actorID, &outletID); err != nil {
		log.Fatal(err)
	}

	result, err := zomatoSvc.ImportOrderByExternalID(context.Background(), kitchenID, actorID, outletID, orderID)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("imported=%d processed=%d in_process=%d skipped=%d",
		result.Imported, result.Processed, result.InProcess, result.SkippedExisting)
}
