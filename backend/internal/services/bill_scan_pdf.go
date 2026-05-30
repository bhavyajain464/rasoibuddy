package services

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
)

// ExtractPDFText returns plain text from all pages of a PDF (e.g. Swiggy Instamart invoices).
func ExtractPDFText(pdfData []byte) (string, error) {
	if len(pdfData) == 0 {
		return "", fmt.Errorf("empty PDF")
	}
	r, err := pdf.NewReader(bytes.NewReader(pdfData), int64(len(pdfData)))
	if err != nil {
		return "", fmt.Errorf("read PDF: %w", err)
	}
	var b strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		text, err := p.GetPlainText(nil)
		if err != nil {
			return "", fmt.Errorf("extract PDF page %d: %w", i, err)
		}
		b.WriteString(text)
		if i < r.NumPage() {
			b.WriteByte('\n')
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "", fmt.Errorf("PDF has no extractable text; try a photo of the bill instead")
	}
	return out, nil
}

func decodeBase64BillData(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("empty bill data")
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 bill data: %w", err)
	}
	return data, nil
}
