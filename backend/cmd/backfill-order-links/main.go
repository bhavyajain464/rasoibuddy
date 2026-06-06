package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/joho/godotenv"
	"kitchenai-backend/internal/db"
	restaurantsvc "kitchenai-backend/internal/restaurant/services"
	"kitchenai-backend/pkg/config"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	database, err := db.InitDB(cfg.DatabaseURL, 2, 1, 5*time.Minute, 90*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	sqlDB := database.GetDB()
	defer sqlDB.Close()
	kid := "12ca918f-2297-4ff0-9da8-50466d2bf767"
	ctx := context.Background()

	orderSvc := restaurantsvc.NewOrderService(sqlDB, restaurantsvc.NewMenuService(sqlDB), nil)
	n, err := orderSvc.BackfillOrderMenuLinks(ctx, kid)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("linked %d order lines\n", n)
}
