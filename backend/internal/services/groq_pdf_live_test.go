package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/joho/godotenv"
	"kitchenai-backend/pkg/config"
)

// TestGroqPDFBillScanLive scans a Swiggy Instamart PDF via Groq text extraction.
// Run: SWIGGY_BILL_PDF=/path/to/bill.pdf go test -v ./internal/services -run TestGroqPDFBillScanLive -count=1
func TestGroqPDFBillScanLive(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live Groq PDF test in -short mode")
	}
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	if cfg.LLMProvider != "groq" || cfg.GroqAPIKey == "" {
		t.Skip("set LLM_PROVIDER=groq and GROQ_API_KEY in backend/.env")
	}
	path := os.Getenv("SWIGGY_BILL_PDF")
	if path == "" {
		path = filepath.Join(os.Getenv("HOME"), "Downloads", "238686024561522(1).pdf")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("PDF not found at %s: %v", path, err)
	}
	items, err := ScanBillGroqFromPDF(context.Background(), cfg, data)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) < 3 {
		t.Fatalf("expected at least 3 items, got %d: %+v", len(items), items)
	}
	t.Logf("parsed %d items:", len(items))
	for _, it := range items {
		t.Logf("  - %s qty=%v %s total=%v", it.Name, it.Quantity, it.Unit, it.TotalPrice)
	}
}
