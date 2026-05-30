package services

import "testing"

func TestValidateBillScanMIME(t *testing.T) {
	allowed := []string{
		"image/jpeg", "image/png", "image/webp", "application/pdf",
	}
	for _, m := range allowed {
		if err := ValidateBillScanMIME(m); err != nil {
			t.Fatalf("expected allowed %q: %v", m, err)
		}
	}
	if err := ValidateBillScanMIME("video/mp4"); err == nil {
		t.Fatal("video should be rejected")
	}
	if err := ValidateBillScanMIME("application/zip"); err == nil {
		t.Fatal("zip should be rejected")
	}
}

func TestNormalizeBillScanMIME(t *testing.T) {
	if got := NormalizeBillScanMIME("", "bill.PDF"); got != "application/pdf" {
		t.Fatalf("pdf ext: got %q", got)
	}
	if got := NormalizeBillScanMIME("image/jpg", ""); got != "image/jpeg" {
		t.Fatalf("jpg alias: got %q", got)
	}
}
