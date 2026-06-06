// One-off: go run ./cmd/seed-zomato-menu [menu.json path] [kitchen_id]
package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"kitchenai-backend/internal/db"
	restaurantsvc "kitchenai-backend/internal/restaurant/services"
	"kitchenai-backend/pkg/config"
)

const defaultKitchenID = "12ca918f-2297-4ff0-9da8-50466d2bf767"
const defaultMenuPath = "/Users/bhavyajain/Downloads/menu.json"

func main() {
	_ = godotenv.Load()

	menuPath := defaultMenuPath
	if len(os.Args) > 1 {
		menuPath = os.Args[1]
	}
	kitchenID := defaultKitchenID
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

	var userID string
	err = sqlDB.QueryRow(`
		SELECT COALESCE(actor_user_id::text, '')
		FROM partner_order_sync WHERE kitchen_id = $1
	`, kitchenID).Scan(&userID)
	if err != nil || userID == "" {
		err = sqlDB.QueryRow(`
			SELECT user_id::text FROM kitchen_members
			WHERE kitchen_id = $1
			ORDER BY created_at ASC
			LIMIT 1
		`, kitchenID).Scan(&userID)
		if err != nil {
			log.Fatal("could not resolve user_id for kitchen:", err)
		}
	}

	menuSvc := restaurantsvc.NewMenuService(sqlDB)
	result, err := menuSvc.SeedFromZomatoMenu(context.Background(), kitchenID, userID, menuPath)
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("menu added=%d skipped=%d inventory added=%d existing=%d errors=%d",
		len(result.MenuAdded), len(result.MenuSkipped),
		len(result.InventoryAdded), len(result.InventoryExists), len(result.Errors))
	for _, e := range result.Errors {
		log.Printf("error: %s", e)
	}
}
