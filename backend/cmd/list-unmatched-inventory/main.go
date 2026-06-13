package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sort"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"kitchenai-backend/internal/services/ingredients"
)

func main() {
	_ = godotenv.Load()
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer db.Close()

	rows, err := db.QueryContext(context.Background(), `
		SELECT canonical_name, COUNT(*)::int
		FROM inventory
		GROUP BY canonical_name
		ORDER BY LOWER(canonical_name)
	`)
	if err != nil {
		panic(err)
	}
	defer rows.Close()

	type item struct {
		name string
		cnt  int
	}
	var unmatched []item
	for rows.Next() {
		var name string
		var cnt int
		if err := rows.Scan(&name, &cnt); err != nil {
			panic(err)
		}
		if _, ok := ingredients.Resolve(name); !ok {
			unmatched = append(unmatched, item{name, cnt})
		}
	}

	sort.Slice(unmatched, func(i, j int) bool {
		return unmatched[i].name < unmatched[j].name
	})

	fmt.Printf("Unmatched distinct names: %d\n\n", len(unmatched))
	totalRows := 0
	for _, u := range unmatched {
		fmt.Printf("%s\t(%d row(s))\n", u.name, u.cnt)
		totalRows += u.cnt
	}
	fmt.Printf("\nTotal inventory rows unmatched: %d\n", totalRows)
}
