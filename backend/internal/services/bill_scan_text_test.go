package services

import (
	"os"
	"strings"
	"testing"
)

func TestTrimInvoiceTextForLLM_Swiggy(t *testing.T) {
	path := os.Getenv("SWIGGY_BILL_PDF")
	if path == "" {
		t.Skip("set SWIGGY_BILL_PDF to run")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := ExtractPDFText(data)
	if err != nil {
		t.Fatal(err)
	}
	trimmed := trimInvoiceTextForLLM(raw)
	if !strings.Contains(trimmed, "Milky Mist") {
		t.Fatal("expected item rows to remain")
	}
	for _, drop := range []string{"ANNEXURE", "Amount in words", "Handling fee\nTax Rate"} {
		if strings.Contains(trimmed, drop) {
			t.Fatalf("expected %q to be trimmed", drop)
		}
	}
	if len(trimmed) >= len(raw) {
		t.Fatalf("expected trimmed text to be shorter: raw=%d trimmed=%d", len(raw), len(trimmed))
	}
}
