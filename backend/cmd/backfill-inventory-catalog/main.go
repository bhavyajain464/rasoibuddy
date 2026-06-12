package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"kitchenai-backend/internal/services/ingredients"

	_ "github.com/lib/pq"
	"database/sql"
)

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		panic("DATABASE_URL is required")
	}

	kitchenID := ""
	if len(os.Args) > 1 {
		kitchenID = os.Args[1]
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	res, err := ingredients.BackfillInventoryCatalog(ctx, db, kitchenID)
	if err != nil {
		panic(err)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(res)
	fmt.Printf("\nDone. scanned=%d updated=%d merged=%d unchanged=%d unmatched=%d\n",
		res.Scanned, res.Updated, res.Merged, res.Unchanged, res.Unmatched)
}
