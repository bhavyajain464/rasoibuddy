package services

import (
	"strings"
	"testing"
)

func TestTrimInvoiceTextForLLM(t *testing.T) {
	raw := "Item A 100\nItem B 200\nANNEXURE\nGST details"
	got := trimInvoiceTextForLLM(raw)
	if got == "" {
		t.Fatal("expected trimmed text")
	}
	if strings.Contains(got, "ANNEXURE") {
		t.Fatalf("annexure should be trimmed: %q", got)
	}
	if !strings.Contains(got, "Item A") {
		t.Fatalf("items should remain: %q", got)
	}
}
