package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kitchenai-backend/pkg/config"
)

func TestExtractBillImageText_VisionOCR(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images:annotate" {
			t.Fatalf("path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(visionAnnotateResponse{
			Responses: []visionAnnotateResult{{
				FullTextAnnotation: &visionFullText{Text: "Swiggy Instamart Invoice\nPotato 1 kg 26.00\nOnion 500 g 40.00\nTotal 66.00"},
			}},
		})
	}))
	defer srv.Close()

	orig := googleVisionAnnotateURL
	googleVisionAnnotateURL = srv.URL + "/v1/images:annotate"
	defer func() { googleVisionAnnotateURL = orig }()

	cfg := &config.Config{GoogleVisionAPIKey: "test-key"}
	text, err := ExtractBillImageText(context.Background(), cfg, []byte("fakejpeg"))
	if err != nil {
		t.Fatal(err)
	}
	if len(text) < minBillOCRChars {
		t.Fatalf("text too short: %q", text)
	}
}

func TestValidateBillImageForOCR(t *testing.T) {
	if err := ValidateBillImageForOCR(nil); err == nil {
		t.Fatal("expected error for empty")
	}
	big := make([]byte, maxBillImageOCRBytes+1)
	if err := ValidateBillImageForOCR(big); err == nil {
		t.Fatal("expected error for oversized")
	}
	if err := ValidateBillImageForOCR([]byte("ok")); err != nil {
		t.Fatal(err)
	}
}

func TestExtractBillImageText_MissingKey(t *testing.T) {
	_, err := ExtractBillImageText(context.Background(), &config.Config{}, []byte("x"))
	if err == nil || !strings.Contains(err.Error(), "GOOGLE_VISION_API_KEY") {
		t.Fatalf("got %v", err)
	}
}
