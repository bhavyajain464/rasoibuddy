package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"kitchenai-backend/pkg/config"
)

const (
	minBillOCRChars = 40
	// maxBillImageOCRBytes keeps Vision requests small (1 free-tier unit per image; Vision allows up to ~20MB).
	maxBillImageOCRBytes = 4 << 20 // 4 MiB
	visionOCRHTTPTimeout = 45 * time.Second
)

var googleVisionAnnotateURL = "https://vision.googleapis.com/v1/images:annotate"

type visionAnnotateRequest struct {
	Requests []visionAnnotateReq `json:"requests"`
}

type visionAnnotateReq struct {
	Image    visionImageInput    `json:"image"`
	Features []visionFeatureSpec `json:"features"`
}

type visionImageInput struct {
	Content string `json:"content"`
}

type visionFeatureSpec struct {
	Type string `json:"type"`
}

type visionAnnotateResponse struct {
	Responses []visionAnnotateResult `json:"responses"`
	Error     *visionAPIError        `json:"error"`
}

type visionAnnotateResult struct {
	FullTextAnnotation *visionFullText `json:"fullTextAnnotation"`
	TextAnnotations    []visionText    `json:"textAnnotations"`
	Error              *visionAPIError `json:"error"`
}

type visionFullText struct {
	Text string `json:"text"`
}

type visionText struct {
	Description string `json:"description"`
}

type visionAPIError struct {
	Message string `json:"message"`
	Code    int    `json:"code"`
}

// ValidateBillImageForOCR rejects oversized images before a paid Vision unit is consumed.
func ValidateBillImageForOCR(imageData []byte) error {
	if len(imageData) == 0 {
		return fmt.Errorf("empty image")
	}
	if len(imageData) > maxBillImageOCRBytes {
		return fmt.Errorf("image too large for OCR (max %d MB); use a smaller photo or PDF", maxBillImageOCRBytes/(1<<20))
	}
	return nil
}

// ExtractBillImageText runs Google Cloud Vision TEXT_DETECTION (OCR) on a bill photo.
// Uses GOOGLE_VISION_API_KEY from GCP (enable vision.googleapis.com). See docs/GOOGLE_VISION_SETUP.md.
// Free tier: first 1,000 TEXT_DETECTION units/month; one bill photo = one unit.
func ExtractBillImageText(ctx context.Context, cfg *config.Config, imageData []byte) (string, error) {
	if cfg == nil {
		return "", fmt.Errorf("config is nil")
	}
	apiKey := strings.TrimSpace(cfg.GoogleVisionAPIKey)
	if apiKey == "" {
		return "", fmt.Errorf("GOOGLE_VISION_API_KEY is not set (create a GCP API key with Cloud Vision API enabled; see docs/GOOGLE_VISION_SETUP.md)")
	}
	if err := ValidateBillImageForOCR(imageData); err != nil {
		return "", err
	}

	body, err := json.Marshal(visionAnnotateRequest{
		Requests: []visionAnnotateReq{{
			Image:    visionImageInput{Content: base64.StdEncoding.EncodeToString(imageData)},
			Features: []visionFeatureSpec{{Type: "TEXT_DETECTION"}},
		}},
	})
	if err != nil {
		return "", err
	}

	reqCtx, cancel := context.WithTimeout(ctx, visionOCRHTTPTimeout)
	defer cancel()

	url := googleVisionAnnotateURL + "?key=" + apiKey
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("vision OCR request: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("vision OCR HTTP %s: %s", resp.Status, truncateForError(raw, 200))
	}

	var parsed visionAnnotateResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("vision OCR: invalid JSON: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return "", fmt.Errorf("vision OCR: %s", parsed.Error.Message)
	}
	if len(parsed.Responses) == 0 {
		return "", fmt.Errorf("vision OCR: empty response")
	}
	if parsed.Responses[0].Error != nil && parsed.Responses[0].Error.Message != "" {
		return "", fmt.Errorf("vision OCR: %s", parsed.Responses[0].Error.Message)
	}

	text := ""
	if parsed.Responses[0].FullTextAnnotation != nil {
		text = parsed.Responses[0].FullTextAnnotation.Text
	}
	if strings.TrimSpace(text) == "" && len(parsed.Responses[0].TextAnnotations) > 0 {
		text = parsed.Responses[0].TextAnnotations[0].Description
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return "", fmt.Errorf("vision OCR: no text detected in image")
	}
	return text, nil
}

func truncateForError(b []byte, max int) string {
	s := strings.TrimSpace(string(b))
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
