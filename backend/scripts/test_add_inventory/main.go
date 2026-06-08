// One-off: go run ./scripts/test_add_inventory.go
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

const kitchenID = "12ca918f-2297-4ff0-9da8-50466d2bf767"
const userID = "fcfdb386-a397-47fc-858b-80a923ae5e97"

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
		fatal(err)
	}
	name := fmt.Sprintf("Stock Test %d", time.Now().Unix())
	body, _ := json.Marshal(map[string]any{"name": name, "qty": 2.5, "unit": "kg"})
	req, _ := http.NewRequest(http.MethodPost, base+"/api/v1/restaurant/"+kitchenID+"/inventory", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	fmt.Printf("status=%d body=%s\n", res.StatusCode, string(b))
	if res.StatusCode >= 400 {
		os.Exit(1)
	}
}

func mintToken(db *sql.DB, secret, userID string) (string, error) {
	sessionID := uuid.New().String()
	expires := time.Now().Add(24 * time.Hour)
	_, err := db.Exec(`INSERT INTO auth_sessions (session_id, user_id, provider, expires_at) VALUES ($1, $2, 'google', $3)`, sessionID, userID, expires)
	if err != nil {
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

func fatal(args ...any) {
	fmt.Fprintln(os.Stderr, args...)
	os.Exit(1)
}
