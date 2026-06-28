// go run ./scripts/test_menu_update/main.go
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
	_ "github.com/lib/pq"

	"kitchenai-backend/pkg/config"
)

const kitchenID = "12ca918f-2297-4ff0-9da8-50466d2bf767"
const userID = "fcfdb386-a397-47fc-858b-80a923ae5e97"

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	base := strings.TrimRight(os.Getenv("API_BASE"), "/")
	if base == "" {
		base = "http://localhost:8080"
	}
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	secret := cfg.SessionTokenSecret
	if secret == "" {
		secret = "kitchenai-dev-session-secret"
	}

	var managerID string
	if err := db.QueryRow(`
		SELECT user_id::text FROM kitchen_members
		WHERE kitchen_id = $1 AND role IN ('owner', 'manager')
		ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END
		LIMIT 1
	`, kitchenID).Scan(&managerID); err != nil {
		managerID = userID
	}
	fmt.Println("user", managerID)

	token, err := mintToken(db, secret, managerID)
	if err != nil {
		panic(err)
	}

	var menuID, name string
	if err := db.QueryRow(`
		SELECT menu_item_id::text, name FROM menu_items
		WHERE kitchen_id = $1 AND is_active LIMIT 1
	`, kitchenID).Scan(&menuID, &name); err != nil {
		panic(err)
	}
	fmt.Println("menu", menuID, name)

	body, _ := json.Marshal(map[string]any{
		"menu_item_id": menuID,
		"name":         name,
		"price_cents":  100,
		"category":     "mains",
		"is_active":    true,
	})
	req, _ := http.NewRequest(http.MethodPost, base+"/api/v1/restaurant/"+kitchenID+"/menu", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	fmt.Printf("POST menu status=%d body=%s\n", res.StatusCode, string(b))

	ingBody, _ := json.Marshal([]map[string]any{{
		"catalog_ingredient_id": "onion",
		"ingredient_name":       "Onion",
		"qty":                   0.1,
		"unit":                  "kg",
		"sort_order":            1,
	}})
	req2, _ := http.NewRequest(http.MethodPut, base+"/api/v1/restaurant/"+kitchenID+"/menu/"+menuID+"/ingredients", bytes.NewReader(ingBody))
	req2.Header.Set("Authorization", "Bearer "+token)
	req2.Header.Set("Content-Type", "application/json")
	res2, err := http.DefaultClient.Do(req2)
	if err != nil {
		panic(err)
	}
	b2, _ := io.ReadAll(res2.Body)
	res2.Body.Close()
	fmt.Printf("PUT ingredients status=%d body=%s\n", res2.StatusCode, string(b2))
}

func mintToken(db *sql.DB, secret, userID string) (string, error) {
	sessionID := uuid.New().String()
	expires := time.Now().Add(24 * time.Hour)
	if _, err := db.Exec(`INSERT INTO auth_sessions (session_id, user_id, provider, expires_at) VALUES ($1, $2, 'google', $3)`, sessionID, userID, expires); err != nil {
		return "", err
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(map[string]any{"sid": sessionID, "exp": expires.Unix(), "iat": time.Now().Unix()})
	payloadB64 := base64.RawURLEncoding.EncodeToString(payload)
	sigInput := header + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(sigInput))
	return sigInput + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
