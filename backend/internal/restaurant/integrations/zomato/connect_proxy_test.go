package zomato

import (
	"strings"
	"testing"
)

func TestRewriteBodyURLsRootRelative(t *testing.T) {
	connectBase := "http://localhost:8080/api/v1/public/zomato/connect/abc123"
	host := "www.zomato.com"
	in := []byte(`<!doctype html><script defer="defer" src="/partners/static/js/main.ea8b9dfc.js"></script>`)
	out := string(rewriteBodyURLs(connectBase, host, in, false))
	want := connectBase + "/h/www.zomato.com/partners/static/js/main.ea8b9dfc.js"
	if !containsAll(out, want) {
		t.Fatalf("got %q want substring %q", out, want)
	}
}

func TestRewriteBodyURLsDoesNotBreakDatadog(t *testing.T) {
	connectBase := "http://localhost:8080/api/v1/public/zomato/connect/abc123"
	host := "www.zomato.com"
	in := []byte(`endpoint:"https://browser-intake-datadoghq.com/api/v2/rum"`)
	out := string(rewriteBodyURLs(connectBase, host, in, true))
	if strings.Contains(out, "localhost:8080") && strings.Contains(out, "datadoghq.comhttp") {
		t.Fatalf("datadog URL mangled: %q", out)
	}
	if out != string(in) {
		t.Fatalf("expected unchanged datadog string, got %q", out)
	}
}

func TestRewriteBodyURLsAbsolute(t *testing.T) {
	connectBase := "http://localhost:8080/api/v1/public/zomato/connect/abc123"
	host := "www.zomato.com"
	in := []byte(`fetch("https://www.zomato.com/partners/api/foo")`)
	out := string(rewriteBodyURLs(connectBase, host, in, false))
	want := connectBase + "/h/www.zomato.com/partners/api/foo"
	if !containsAll(out, want) {
		t.Fatalf("got %q want substring %q", out, want)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !contains(s, p) {
			return false
		}
	}
	return true
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
