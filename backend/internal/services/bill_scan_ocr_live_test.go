package services

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/joho/godotenv"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"

	"kitchenai-backend/pkg/config"
)

// TestVisionOCRLive calls Google Cloud Vision TEXT_DETECTION.
// Run: go test -v ./internal/services -run TestVisionOCRLive -count=1
// Optional: BILL_IMAGE_PATH=/path/to/receipt.jpg
func TestVisionOCRLive(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live Vision test in -short mode")
	}
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	if cfg.GoogleVisionAPIKey == "" {
		t.Skip("set GOOGLE_VISION_API_KEY in backend/.env")
	}

	var imageData []byte
	if path := os.Getenv("BILL_IMAGE_PATH"); path != "" {
		imageData, err = os.ReadFile(path)
		if err != nil {
			t.Fatalf("read image: %v", err)
		}
	} else {
		imageData, err = renderTestReceiptPNG()
		if err != nil {
			t.Fatal(err)
		}
	}

	text, err := ExtractBillImageText(context.Background(), cfg, imageData)
	if err != nil {
		t.Fatal(err)
	}
	if len(text) < minBillOCRChars {
		t.Fatalf("OCR too short (%d chars): %q", len(text), text)
	}
	t.Logf("OCR OK (%d chars): %s", len(text), truncateForError([]byte(text), 500))
}

// TestBillScanImageLive runs OCR + Groq text parse on a bill photo.
func TestBillScanImageLive(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live bill scan in -short mode")
	}
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	if cfg.GoogleVisionAPIKey == "" {
		t.Skip("set GOOGLE_VISION_API_KEY in backend/.env")
	}
	if !cfg.HasGroqAPIKey() {
		t.Skip("set GROQ_API_KEY in backend/.env")
	}

	var imageData []byte
	if path := os.Getenv("BILL_IMAGE_PATH"); path != "" {
		imageData, err = os.ReadFile(path)
	} else {
		imageData, err = renderTestReceiptPNG()
	}
	if err != nil {
		t.Fatal(err)
	}

	items, err := ScanBillGroqFromBytes(context.Background(), cfg, imageData, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) < 2 {
		t.Fatalf("expected at least 2 items, got %d: %+v", len(items), items)
	}
	t.Logf("parsed %d items:", len(items))
	for _, it := range items {
		t.Logf("  - %s qty=%v %s", it.Name, it.Quantity, it.Unit)
	}
}

func renderTestReceiptPNG() ([]byte, error) {
	const w, h = 640, 420
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.White)
		}
	}
	lines := []string{
		"Swiggy Instamart Invoice",
		"Potato 1 kg       Rs 26.00",
		"Onion 500 g       Rs 40.00",
		"Tomato 500 g      Rs 35.00",
		"Total             Rs 101.00",
	}
	drawer := font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.Black),
		Face: basicfont.Face7x13,
	}
	y := 36
	for _, line := range lines {
		drawer.Dot = fixed.P(24, y)
		drawer.DrawString(line)
		y += 28
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
