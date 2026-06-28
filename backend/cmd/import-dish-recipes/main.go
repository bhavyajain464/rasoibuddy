package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/internal/services/catalogdb"
)

func main() {
	recipesPath := flag.String("recipes", "", "path to rasoibuddy recipes.json (default: ../data/rasoibuddy/recipes.json)")
	reportPath := flag.String("report", "", "optional path to write unmatched dish ids JSON")
	flag.Parse()

	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	path := *recipesPath
	if path == "" {
		path = filepath.Join("..", "data", "rasoibuddy", "recipes.json")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read recipes: %v\n", err)
		os.Exit(1)
	}
	external, err := services.ParseExternalRecipesJSON(raw)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse recipes: %v\n", err)
		os.Exit(1)
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()
	catalogdb.Init(db)

	catalog := services.DishCatalog()
	if len(catalog) == 0 {
		fmt.Fprintln(os.Stderr, "catalog is empty — seed dishes first")
		os.Exit(1)
	}

	ctx := context.Background()
	stats, err := services.ImportDishRecipesFromExternal(ctx, db, catalog, external)
	if err != nil {
		fmt.Fprintf(os.Stderr, "import: %v\n", err)
		os.Exit(1)
	}

	enc, _ := json.MarshalIndent(stats, "", "  ")
	fmt.Println(string(enc))

	if *reportPath != "" && len(stats.UnmatchedIDs) > 0 {
		_ = os.WriteFile(*reportPath, enc, 0o644)
	}
}
