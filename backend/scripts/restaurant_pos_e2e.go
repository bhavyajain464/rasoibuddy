// One-off E2E: menu + BOM + inventory + order + stock deduction.
// Run: cd backend && go run ./scripts/restaurant_pos_e2e.go
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"kitchenai-backend/pkg/config"
	_ "github.com/lib/pq"
)

const (
	kitchenID = "12ca918f-2297-4ff0-9da8-50466d2bf767"
	userID    = "fcfdb386-a397-47fc-858b-80a923ae5e97"
)

type invRow struct {
	ItemID        string  `json:"item_id"`
	CanonicalName string  `json:"canonical_name"`
	Qty           float64 `json:"qty"`
	Unit          string  `json:"unit"`
}

type menuItem struct {
	MenuItemID string `json:"menu_item_id"`
	Name       string `json:"name"`
	PriceCents int    `json:"price_cents"`
}

type order struct {
	OrderID string `json:"order_id"`
	Status  string `json:"status"`
}

func main() {
	_ = godotenv.Load()
	base := strings.TrimRight(os.Getenv("API_BASE"), "/")
	if base == "" {
		base = "http://localhost:8080"
	}
	cfg, _ := config.Load()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" && cfg != nil {
		dbURL = cfg.DatabaseURL
	}
	if dbURL == "" {
		fatal("DATABASE_URL required")
	}
	secret := os.Getenv("SESSION_TOKEN_SECRET")
	if secret == "" && cfg != nil {
		secret = cfg.SessionTokenSecret
	}
	if secret == "" {
		secret = "kitchenai-dev-session-secret"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		fatal(err)
	}
	defer db.Close()

	token, err := mintToken(db, secret, userID)
	if err != nil {
		fatal("mint token:", err)
	}
	fmt.Println("Auth token ready")

	// Seed inventory via POST /restaurant/{id}/inventory or direct DB for scripts.
	ingredients := []struct {
		name string
		qty  float64
		unit string
	}{
		{"Tomato", 5000, "g"},
		{"Onion", 3000, "g"},
		{"Paneer", 2000, "g"},
		{"Basmati Rice", 10000, "g"},
		{"Cooking Oil", 5000, "ml"},
	}
	itemIDs := map[string]string{}
	for _, ing := range ingredients {
		id, err := upsertInventory(db, kitchenID, userID, ing.name, ing.qty, ing.unit)
		if err != nil {
			fatal("inventory", ing.name, err)
		}
		itemIDs[ing.name] = id
		fmt.Printf("Inventory: %s = %.0f %s (%s)\n", ing.name, ing.qty, ing.unit, id[:8])
	}

	// Create dish: Paneer Butter Masala
	menu := apiPost[menuItem](base, token, fmt.Sprintf("/api/v1/restaurant/%s/menu", kitchenID), map[string]any{
		"name":        "Paneer Butter Masala",
		"price_cents": 32000,
		"category":    "main",
		"is_active":   true,
	})
	fmt.Printf("Menu item: %s (%s)\n", menu.Name, menu.MenuItemID[:8])

	recipe := []map[string]any{
		{"ingredient_name": "Paneer", "qty": 200, "unit": "g", "waste_factor": 1.0, "inventory_item_id": itemIDs["Paneer"]},
		{"ingredient_name": "Tomato", "qty": 150, "unit": "g", "waste_factor": 1.05, "inventory_item_id": itemIDs["Tomato"]},
		{"ingredient_name": "Onion", "qty": 80, "unit": "g", "waste_factor": 1.0, "inventory_item_id": itemIDs["Onion"]},
		{"ingredient_name": "Cooking Oil", "qty": 30, "unit": "ml", "waste_factor": 1.0, "inventory_item_id": itemIDs["Cooking Oil"]},
	}
	apiPut(base, token, fmt.Sprintf("/api/v1/restaurant/%s/menu/%s/ingredients", kitchenID, menu.MenuItemID), recipe)
	fmt.Println("Recipe set (4 ingredients per serving)")

	before := apiGet[[]invRow](base, token, fmt.Sprintf("/api/v1/restaurant/%s/inventory", kitchenID))
	printInventory("Before order", before)

	// Create + complete order (qty 2 servings)
	created := apiPost[order](base, token, fmt.Sprintf("/api/v1/restaurant/%s/orders", kitchenID), map[string]any{
		"lines": []map[string]any{{"menu_item_id": menu.MenuItemID, "qty": 2}},
	})
	fmt.Printf("Order created: %s\n", created.OrderID[:8])

	completed := apiPost[order](base, token, fmt.Sprintf("/api/v1/restaurant/%s/orders/%s/complete", kitchenID, created.OrderID), nil)
	fmt.Printf("Order completed: status=%s\n", completed.Status)

	after := apiGet[[]invRow](base, token, fmt.Sprintf("/api/v1/restaurant/%s/inventory", kitchenID))
	printInventory("After order (2× serving)", after)

	// Expected deductions for qty=2:
	// Paneer 400g, Tomato 315g (150*1.05*2), Onion 160g, Oil 60ml
	expected := map[string]float64{
		"Paneer": 400, "Tomato": 315, "Onion": 160, "Cooking Oil": 60,
	}
	fmt.Println("\n=== Verification ===")
	ok := true
	beforeMap := toMap(before)
	afterMap := toMap(after)
	for name, deduct := range expected {
		b := beforeMap[name]
		a := afterMap[name]
		delta := b - a
		match := abs(delta-deduct) < 0.01
		if !match {
			ok = false
		}
		status := "OK"
		if !match {
			status = "FAIL"
		}
		fmt.Printf("[%s] %s: %.1f → %.1f (Δ %.1f, expected Δ %.1f)\n", status, name, b, a, delta, deduct)
	}
	if ok {
		fmt.Println("\nPASS: inventory deducted correctly for 2× Paneer Butter Masala")
	} else {
		os.Exit(1)
	}
}

func upsertInventory(db *sql.DB, kitchenID, userID, name string, qty float64, unit string) (string, error) {
	var id string
	err := db.QueryRow(`
		SELECT item_id::text FROM inventory
		WHERE kitchen_id = $1 AND LOWER(canonical_name) = LOWER($2)
	`, kitchenID, name).Scan(&id)
	if err == sql.ErrNoRows {
		err = db.QueryRow(`
			INSERT INTO inventory (kitchen_id, user_id, canonical_name, qty, unit, food_group, is_manual)
			VALUES ($1, $2, $3, $4, $5, 'other', TRUE)
			RETURNING item_id::text
		`, kitchenID, userID, name, qty, unit).Scan(&id)
	}
	if err != nil {
		return "", err
	}
	_, err = db.Exec(`
		UPDATE inventory SET qty = $3, unit = $4, updated_at = CURRENT_TIMESTAMP
		WHERE item_id = $1 AND kitchen_id = $2
	`, id, kitchenID, qty, unit)
	return id, err
}

func mintToken(db *sql.DB, secret, userID string) (string, error) {
	sessionID := uuid.New().String()
	expires := time.Now().Add(24 * time.Hour)
	_, err := db.Exec(`
		INSERT INTO auth_sessions (session_id, user_id, provider, expires_at)
		VALUES ($1, $2, 'google', $3)
	`, sessionID, userID, expires)
	if err != nil {
		return "", err
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(map[string]any{
		"sid": sessionID,
		"exp": expires.Unix(),
		"iat": time.Now().Unix(),
	})
	payloadB64 := base64.RawURLEncoding.EncodeToString(payload)
	signingInput := header + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return signingInput + "." + sig, nil
}

func apiGet[T any](base, token, path string) T {
	req, _ := http.NewRequest(http.MethodGet, base+path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fatal("GET", path, err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		fatal("GET", path, res.StatusCode, string(body))
	}
	var out T
	if err := json.Unmarshal(body, &out); err != nil {
		fatal("decode", path, err, string(body))
	}
	return out
}

func apiPost[T any](base, token, path string, payload any) T {
	var body io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		body = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(http.MethodPost, base+path, body)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fatal("POST", path, err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		fatal("POST", path, res.StatusCode, string(b))
	}
	var out T
	if err := json.Unmarshal(b, &out); err != nil {
		fatal("decode", path, err, string(b))
	}
	return out
}

func apiPut(base, token, path string, payload any) {
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPut, base+path, bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fatal("PUT", path, err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		fatal("PUT", path, res.StatusCode, string(body))
	}
}

func toMap(rows []invRow) map[string]float64 {
	m := map[string]float64{}
	for _, r := range rows {
		m[r.CanonicalName] = r.Qty
	}
	return m
}

func printInventory(label string, rows []invRow) {
	fmt.Printf("\n%s:\n", label)
	for _, r := range rows {
		if r.CanonicalName == "Basmati Rice" {
			continue // not in recipe
		}
		fmt.Printf("  %s: %.1f %s\n", r.CanonicalName, r.Qty, r.Unit)
	}
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func fatal(args ...any) {
	fmt.Fprintln(os.Stderr, args...)
	os.Exit(1)
}
