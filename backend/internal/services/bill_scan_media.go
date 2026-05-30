package services

import (
	"fmt"
	"strings"
)

// Allowed bill scan MIME types (images + PDF). Video and other formats are rejected.
var allowedBillScanMIME = map[string]struct{}{
	"image/jpeg":      {},
	"image/jpg":       {},
	"image/png":       {},
	"image/webp":      {},
	"image/heic":      {},
	"image/heif":      {},
	"application/pdf": {},
}

// NormalizeBillScanMIME maps aliases and file extensions to a canonical MIME type.
func NormalizeBillScanMIME(mime, filename string) string {
	m := strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0]))
	switch m {
	case "image/jpg":
		return "image/jpeg"
	case "application/x-pdf":
		return "application/pdf"
	}
	if m != "" && m != "application/octet-stream" {
		return m
	}
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".pdf"):
		return "application/pdf"
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	case strings.HasSuffix(lower, ".heic"), strings.HasSuffix(lower, ".heif"):
		return "image/heic"
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		return "image/jpeg"
	default:
		return "image/jpeg"
	}
}

// ValidateBillScanMIME returns an error if the type cannot be scanned.
func ValidateBillScanMIME(mime string) error {
	m := strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0]))
	if strings.HasPrefix(m, "video/") {
		return fmt.Errorf("video files are not supported for bill scan; use a photo or PDF")
	}
	if _, ok := allowedBillScanMIME[m]; ok {
		return nil
	}
	return fmt.Errorf("unsupported file type %q; use JPEG, PNG, WebP, HEIC, or PDF", mime)
}

func isPDFMime(mime string) bool {
	return strings.EqualFold(strings.TrimSpace(strings.Split(mime, ";")[0]), "application/pdf")
}
