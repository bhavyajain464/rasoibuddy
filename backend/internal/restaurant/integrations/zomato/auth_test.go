package zomato

import "testing"

func TestParseAuthJSONEnvelope(t *testing.T) {
	raw := `{"cookie_header":"session_id=abc; csrf=def456"}`
	auth, err := ParseAuth([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(auth.Cookies) < 2 {
		t.Fatalf("cookies=%+v", auth.Cookies)
	}
}

func TestCSRFTFromCookies(t *testing.T) {
	cookies := []Cookie{
		{Name: "__Host-zmxcsrft", Value: "abc123"},
	}
	if got := csrftFromCookies(cookies); got != "abc123" {
		t.Fatalf("csrft=%q", got)
	}
	auth := &Auth{Cookies: cookies}
	if got := auth.mxCSRFTHeader(); got != "abc123" {
		t.Fatalf("mxCSRFT=%q", got)
	}
}

func TestParseCookieHeader(t *testing.T) {
	raw := "session_id=abc123; zomato_auth=xyz; csrf=abc123def"
	cookies, err := parseCookieHeader(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(cookies) < 2 {
		t.Fatalf("cookies=%+v", cookies)
	}
	auth, err := ParseAuth([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(auth.Cookies) < 2 {
		t.Fatalf("auth cookies=%+v", auth.Cookies)
	}
	if auth.CSRFToken != "" {
		t.Fatalf("csrf token should not be set from cookie, got %q", auth.CSRFToken)
	}
}
