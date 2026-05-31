package services

import (
	"context"
	"fmt"

	"kitchenai-backend/pkg/config"
)

// EstimateShelfLifeForConfig runs shelf-life estimation using the single LLM chosen by cfg.LLMProvider.
func EstimateShelfLifeForConfig(ctx context.Context, cfg *config.Config, itemNames []string) ([]ShelfLifeEstimate, error) {
	if len(itemNames) == 0 {
		return nil, nil
	}
	switch cfg.LLMProvider {
	case "gemini":
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty")
		}
		g, err := NewGeminiService(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			return nil, err
		}
		defer g.Close()
		return g.EstimateShelfLife(itemNames)
	default:
		if !cfg.HasGroqAPIKey() {
			return nil, fmt.Errorf("LLM_PROVIDER=groq but GROQ_API_KEY is empty")
		}
		return EstimateShelfLifeGroq(ctx, cfg, itemNames)
	}
}

// ScanBillBase64ForConfig scans a base64-encoded bill image or PDF using the configured LLM.
func ScanBillBase64ForConfig(ctx context.Context, cfg *config.Config, base64Image, imageType string) ([]BillItem, error) {
	imageType = NormalizeBillScanMIME(imageType, "")
	if err := ValidateBillScanMIME(imageType); err != nil {
		return nil, err
	}
	if isPDFMime(imageType) {
		return scanBillPDFBase64(ctx, cfg, base64Image, imageType)
	}
	switch cfg.LLMProvider {
	case "gemini":
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty")
		}
		g, err := NewGeminiService(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			return nil, err
		}
		defer g.Close()
		return g.ScanBillFromBase64(base64Image, imageType)
	default:
		if !cfg.HasGroqAPIKey() {
			return nil, fmt.Errorf("LLM_PROVIDER=groq but GROQ_API_KEY is empty")
		}
		return ScanBillGroqFromBase64(ctx, cfg, base64Image, imageType)
	}
}

// ScanBillBytesForConfig scans raw bill image or PDF bytes using the configured LLM.
func ScanBillBytesForConfig(ctx context.Context, cfg *config.Config, imageData []byte, imageType string) ([]BillItem, error) {
	imageType = NormalizeBillScanMIME(imageType, "")
	if err := ValidateBillScanMIME(imageType); err != nil {
		return nil, err
	}
	if isPDFMime(imageType) {
		return scanBillPDFBytes(ctx, cfg, imageData, imageType)
	}
	switch cfg.LLMProvider {
	case "gemini":
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty")
		}
		g, err := NewGeminiService(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			return nil, err
		}
		defer g.Close()
		return g.ScanBill(imageData, imageType)
	default:
		if !cfg.HasGroqAPIKey() {
			return nil, fmt.Errorf("LLM_PROVIDER=groq but GROQ_API_KEY is empty")
		}
		return ScanBillGroqFromBytes(ctx, cfg, imageData, imageType)
	}
}

func scanBillPDFBase64(ctx context.Context, cfg *config.Config, base64PDF, imageType string) ([]BillItem, error) {
	pdfData, err := decodeBase64BillData(base64PDF)
	if err != nil {
		return nil, err
	}
	return scanBillPDFBytes(ctx, cfg, pdfData, imageType)
}

func scanBillPDFBytes(ctx context.Context, cfg *config.Config, pdfData []byte, imageType string) ([]BillItem, error) {
	switch cfg.LLMProvider {
	case "gemini":
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("LLM_PROVIDER=gemini but GEMINI_API_KEY is empty")
		}
		g, err := NewGeminiService(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			return nil, err
		}
		defer g.Close()
		return g.ScanBill(pdfData, imageType)
	default:
		if !cfg.HasGroqAPIKey() {
			return nil, fmt.Errorf("LLM_PROVIDER=groq but GROQ_API_KEY is empty")
		}
		return ScanBillGroqFromPDF(ctx, cfg, pdfData)
	}
}
