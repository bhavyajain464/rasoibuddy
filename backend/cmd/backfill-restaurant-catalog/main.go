package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"kitchenai-backend/internal/restaurant/services"

	_ "github.com/lib/pq"
	"database/sql"
)

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		panic("DATABASE_URL is required")
	}

	outletID := ""
	if len(os.Args) > 1 {
		outletID = os.Args[1]
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	res, err := services.BackfillRestaurantCatalogData(ctx, db, outletID)
	if err != nil {
		panic(err)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(res)
	fmt.Printf("\nDone. kitchens=%d inventory(updated=%d merged=%d) shopping(updated=%d) recipes(updated=%d) unmatched=%d\n",
		res.KitchensScanned,
		res.Inventory.Updated, res.Inventory.Merged,
		res.ShoppingUpdated,
		res.RecipeUpdated,
		res.Inventory.Unmatched+res.ShoppingUnmatched+res.RecipeUnmatched,
	)
}
