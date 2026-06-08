// One-off: go run ./scripts/seed_menu_outlet.go 22702836
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"kitchenai-backend/internal/restaurant/integrations/zomato"
	restsvc "kitchenai-backend/internal/restaurant/services"
	"kitchenai-backend/pkg/config"
)

func main() {
	outletID := "22702836"
	if len(os.Args) > 1 {
		outletID = strings.TrimSpace(os.Args[1])
	}
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	var kitchenID, actorID string
	var authJSON []byte
	err = db.QueryRow(`
		SELECT o.kitchen_id::text, COALESCE(o.actor_user_id::text, ''), a.auth_json
		FROM partner_order_sync o
		JOIN zomato_kitchen_auth a ON a.kitchen_id = o.kitchen_id
		WHERE o.partner_outlet_id = $1
		ORDER BY o.updated_at DESC
		LIMIT 1
	`, outletID).Scan(&kitchenID, &actorID, &authJSON)
	if err != nil {
		panic(fmt.Sprintf("outlet %s: %v", outletID, err))
	}
	if actorID == "" {
		_ = db.QueryRow(`SELECT user_id::text FROM kitchen_members WHERE kitchen_id = $1 ORDER BY joined_at ASC LIMIT 1`, kitchenID).Scan(&actorID)
	}
	auth, err := zomato.ParseAuth(authJSON)
	if err != nil {
		panic(err)
	}

	menuSvc := restsvc.NewMenuService(db, cfg)
	svc := zomato.NewService(db, nil, menuSvc)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	fmt.Printf("Fetching menu from Zomato for outlet=%s kitchen=%s\n", outletID, kitchenID)
	start := time.Now()
	result, err := svc.FetchAndSeedMenu(ctx, kitchenID, actorID, outletID, auth)
	fmt.Printf("elapsed=%s\n", time.Since(start).Round(time.Millisecond))
	if err != nil {
		panic(err)
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(b))

	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM menu_items WHERE kitchen_id = $1`, kitchenID).Scan(&count)
	fmt.Printf("menu_items total=%d\n", count)
}
