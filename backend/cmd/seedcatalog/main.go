package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"database/sql"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/internal/services/catalogdb"
	"kitchenai-backend/internal/services/ingredients"
)

func main() {
	dishesOnly := flag.Bool("dishes-only", false, "skip ingredient upserts; load alias index from DB and seed dishes only")
	flag.Parse()

	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	ctx := context.Background()

	stats, err := catalogdb.SeedWithOptions(ctx, db, ingredients.CatalogJSON(), services.DishCatalogJSON(), catalogdb.SeedOptions{
		DishesOnly: *dishesOnly,
	}, os.Stderr)
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(stats)
	if err != nil {
		fmt.Fprintf(os.Stderr, "seed failed: %v\n", err)
		os.Exit(1)
	}
	catalogdb.InvalidateDishCache()
	fmt.Printf("\nSeeded %d ingredients, %d aliases, %d dishes, %d dish_ingredients\n",
		stats.Ingredients, stats.Aliases, stats.Dishes, stats.DishIngredients)
}
