package ingredients

import (
	"database/sql"
	"os"
	"testing"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"kitchenai-backend/internal/services/catalogdb"
)

func TestMain(m *testing.M) {
	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load("../../.env")
	if u := os.Getenv("DATABASE_URL"); u != "" {
		if db, err := sql.Open("postgres", u); err == nil {
			InitCatalog(db)
		}
	}
	os.Exit(m.Run())
}

func requireSeededCatalog(t *testing.T) {
	t.Helper()
	if catalogdb.DB() == nil {
		t.Skip("DATABASE_URL not set")
	}
	var n int
	if err := catalogdb.DB().QueryRow(`SELECT COUNT(*) FROM ingredients`).Scan(&n); err != nil || n < 100 {
		t.Skip("catalog not seeded — run: go run ./cmd/seedcatalog")
	}
}
