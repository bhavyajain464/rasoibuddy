// One-off: go run ./scripts/test_zomato_seed_menu.go [partner_outlet_id] [kitchen_id]
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
	defaultKitchenID = "12ca918f-2297-4ff0-9da8-50466d2bf767"
	defaultUserID    = "fcfdb386-a397-47fc-858b-80a923ae5e97"
)

func main() {
	outletID := "22267610"
	if len(os.Args) > 1 {
		outletID = strings.TrimSpace(os.Args[1])
	}
	kitchenID := defaultKitchenID
	if len(os.Args) > 2 {
		kitchenID = strings.TrimSpace(os.Args[2])
	}

	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	secret := os.Getenv("SESSION_TOKEN_SECRET")
	if secret == "" {
		secret = cfg.SessionTokenSecret
	}
	if secret == "" {
		secret = "kitchenai-dev-session-secret"
	}
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	if linkedKitchen, err := lookupKitchenByOutlet(db, outletID); err == nil && linkedKitchen != "" {
		kitchenID = linkedKitchen
		fmt.Printf("Using kitchen linked to outlet %s: %s\n", outletID, kitchenID)
	} else if len(os.Args) <= 2 {
		fmt.Printf("No kitchen linked to outlet %s — using kitchen %s with explicit partner_outlet_id\n", outletID, kitchenID)
	}

	userID := defaultUserID
	_ = db.QueryRow(`SELECT user_id::text FROM kitchen_members WHERE kitchen_id = $1 ORDER BY joined_at ASC LIMIT 1`, kitchenID).Scan(&userID)

	token, err := mintToken(db, secret, userID)
	if err != nil {
		panic(err)
	}
	base := "http://localhost:8080/api/v1"

	payload, _ := json.Marshal(map[string]string{"partner_outlet_id": outletID})
	req, _ := http.NewRequest(http.MethodPost, base+"/restaurant/"+kitchenID+"/integrations/zomato/seed-menu", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	fmt.Printf("POST seed-menu outlet=%s kitchen=%s status=%d\n%s\n\n", outletID, kitchenID, res.StatusCode, string(body))
	if res.StatusCode >= 400 {
		os.Exit(1)
	}

	req2, _ := http.NewRequest(http.MethodGet, base+"/restaurant/"+kitchenID+"/menu?limit=5&active=true", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	res2, err := http.DefaultClient.Do(req2)
	if err != nil {
		panic(err)
	}
	body2, _ := io.ReadAll(res2.Body)
	res2.Body.Close()
	fmt.Printf("GET menu status=%d\n%s\n", res2.StatusCode, string(body2))
}

func lookupKitchenByOutlet(db *sql.DB, outletID string) (string, error) {
	var kitchenID string
	err := db.QueryRow(`SELECT kitchen_id::text FROM partner_order_sync WHERE partner_outlet_id = $1 LIMIT 1`, outletID).Scan(&kitchenID)
	return kitchenID, err
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
	signingInput := header + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return signingInput + "." + sig, nil
}
