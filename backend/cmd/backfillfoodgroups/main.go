package main

import (
	"context"
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
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	catalog, inventory, err := services.BackfillRestaurantFoodGroups(ctx, db)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Updated catalog=%d inventory=%d\n", catalog, inventory)
}
