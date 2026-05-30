package services

import (
	"os"
	"strings"
	"testing"
)

func TestExtractPDFText_SwiggySample(t *testing.T) {
	path := os.Getenv("SWIGGY_BILL_PDF")
	if path == "" {
		t.Skip("set SWIGGY_BILL_PDF to run")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text, err := ExtractPDFText(data)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"TAX INVOICE", "Milky Mist", "Potato", "Catch Jeera"} {
		if !strings.Contains(text, want) {
			t.Fatalf("expected %q in extracted text", want)
		}
	}
}
