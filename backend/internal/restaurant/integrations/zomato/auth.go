package zomato

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultCSRFT = "536c29209db0b808d438a0ba23b88e33"

type Cookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Domain   string `json:"domain,omitempty"`
	Path     string `json:"path,omitempty"`
	Expires  int64  `json:"expires,omitempty"`
	HTTPOnly bool   `json:"httpOnly,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
	SameSite string `json:"sameSite,omitempty"`
}

type Auth struct {
	Cookies         []Cookie   `json:"cookies"`
	CSRFToken       string     `json:"csrfToken,omitempty"`
	CSRFRefreshedAt *time.Time `json:"csrfRefreshedAt,omitempty"`
}

func ParseAuth(raw []byte) (*Auth, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("auth required")
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("auth required")
	}

	switch trimmed[0] {
	case '[':
		var cookies []Cookie
		if err := json.Unmarshal(trimmed, &cookies); err != nil {
			return nil, fmt.Errorf("invalid cookies array: %w", err)
		}
		if len(cookies) == 0 {
			return nil, fmt.Errorf("auth_json must include cookies")
		}
		return authFromCookies(cookies), nil
	case '{':
		return parseAuthJSONObject(trimmed)
	case '"':
		var s string
		if err := json.Unmarshal(trimmed, &s); err != nil {
			return nil, fmt.Errorf("invalid auth string: %w", err)
		}
		return ParseAuth([]byte(s))
	default:
		return parseAuthCookieHeader(string(trimmed))
	}
}

func parseAuthJSONObject(raw []byte) (*Auth, error) {
	var envelope struct {
		Cookies         []Cookie `json:"cookies"`
		CookieHeader    string   `json:"cookie_header"`
		CookieHeaderAlt string   `json:"cookieHeader"`
		AuthJSON        string   `json:"auth_json"`
		CSRFToken       string   `json:"csrfToken"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("invalid auth_json: %w", err)
	}
	for _, hdr := range []string{envelope.CookieHeader, envelope.CookieHeaderAlt, envelope.AuthJSON} {
		if strings.TrimSpace(hdr) != "" {
			return ParseAuth([]byte(hdr))
		}
	}
	if len(envelope.Cookies) > 0 {
		auth := authFromCookies(envelope.Cookies)
		if strings.TrimSpace(envelope.CSRFToken) != "" {
			auth.CSRFToken = strings.TrimSpace(envelope.CSRFToken)
		}
		return auth, nil
	}
	if cookies, err := parseCookieHeader(string(raw)); err == nil && len(cookies) > 0 {
		return authFromCookies(cookies), nil
	}
	return nil, fmt.Errorf("auth_json must include cookies or cookie_header")
}

func parseAuthCookieHeader(raw string) (*Auth, error) {
	cookies, err := parseCookieHeader(raw)
	if err != nil {
		return nil, err
	}
	return authFromCookies(cookies), nil
}

func parseCookieHeader(raw string) ([]Cookie, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "\ufeff")
	if len(raw) >= 7 && strings.EqualFold(raw[:7], "cookie:") {
		raw = strings.TrimSpace(raw[7:])
	}
	if raw == "" || !strings.Contains(raw, "=") {
		return nil, fmt.Errorf("empty cookie header — paste the full Request header value for cookie from DevTools")
	}
	var cookies []Cookie
	for _, part := range splitCookiePairs(raw) {
		eq := strings.Index(part, "=")
		if eq <= 0 {
			continue
		}
		name := strings.TrimSpace(part[:eq])
		value := strings.TrimSpace(part[eq+1:])
		if name == "" || value == "" {
			continue
		}
		cookies = append(cookies, Cookie{
			Name:   name,
			Value:  value,
			Domain: ".zomato.com",
			Path:   "/",
		})
	}
	if len(cookies) == 0 {
		return nil, fmt.Errorf("no cookies parsed — copy the cookie header from a Zomato api.zomato.com request")
	}
	return cookies, nil
}

func splitCookiePairs(raw string) []string {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	var parts []string
	for _, chunk := range strings.Split(raw, ";") {
		for _, line := range strings.Split(chunk, "\n") {
			line = strings.TrimSpace(line)
			if line != "" {
				parts = append(parts, line)
			}
		}
	}
	return parts
}

func csrfFromCookies(cookies []Cookie) string {
	for _, c := range cookies {
		if strings.EqualFold(c.Name, "csrf") && strings.TrimSpace(c.Value) != "" {
			return strings.TrimSpace(c.Value)
		}
	}
	return ""
}

func authFromCookies(cookies []Cookie) *Auth {
	// CSRFToken must come from set-csrf refresh, not the csrf cookie value.
	return &Auth{Cookies: cookies}
}

func csrftFromCookies(cookies []Cookie) string {
	for _, c := range cookies {
		if strings.EqualFold(c.Name, "__Host-zmxcsrft") && strings.TrimSpace(c.Value) != "" {
			return strings.TrimSpace(c.Value)
		}
	}
	return ""
}

func (a *Auth) mxCSRFTHeader() string {
	if v := csrftFromCookies(a.Cookies); v != "" {
		return v
	}
	return csrftHeader()
}

func (a *Auth) cookieHeader() string {
	parts := make([]string, 0, len(a.Cookies))
	for _, c := range a.Cookies {
		if c.Name == "" {
			continue
		}
		parts = append(parts, c.Name+"="+c.Value)
	}
	return strings.Join(parts, "; ")
}

func csrftHeader() string {
	if v := strings.TrimSpace(os.Getenv("ZOMATO_CSRFT")); v != "" {
		return v
	}
	return defaultCSRFT
}

type AuthError struct {
	Code    string
	Message string
}

func (e *AuthError) Error() string { return e.Message }

func isLoginRequired(status int) bool {
	return status == http.StatusUnauthorized || status == http.StatusForbidden
}

func (a *Auth) refreshCSRF(ctx context.Context, client *http.Client) (string, error) {
	// Akamai rejects POST without Content-Length; use explicit empty body.
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.zomato.com/merchant-gw/set-csrf", http.NoBody)
	if err != nil {
		return "", err
	}
	req.ContentLength = 0
	req.Header.Set("cookie", a.cookieHeader())
	req.Header.Set("x-client-id", "zomato_web_merchant")
	req.Header.Set("content-type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if isLoginRequired(resp.StatusCode) {
		return "", &AuthError{Code: "login_required", Message: "Zomato session expired — import a fresh partner session"}
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("CSRF refresh failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var parsed struct {
		CSRF string `json:"csrf"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.CSRF == "" {
		return "", fmt.Errorf("CSRF refresh returned no token")
	}
	now := time.Now().UTC()
	a.CSRFToken = parsed.CSRF
	a.CSRFRefreshedAt = &now
	a.syncCSRFCookie(parsed.CSRF)
	return parsed.CSRF, nil
}

func (a *Auth) syncCSRFCookie(token string) {
	for i := range a.Cookies {
		if strings.EqualFold(a.Cookies[i].Name, "csrf") {
			a.Cookies[i].Value = token
			return
		}
	}
}

const csrfCacheTTL = 10 * time.Minute

func (a *Auth) ensureCSRF(ctx context.Context, client *http.Client) (string, error) {
	if strings.TrimSpace(a.CSRFToken) != "" && a.CSRFRefreshedAt != nil &&
		time.Since(*a.CSRFRefreshedAt) < csrfCacheTTL {
		return a.CSRFToken, nil
	}
	return a.refreshCSRF(ctx, client)
}

func (a *Auth) apiHeaders(csrf string) http.Header {
	h := http.Header{}
	h.Set("cookie", a.cookieHeader())
	h.Set("content-type", "application/json")
	h.Set("accept", "application/json, text/plain, */*")
	h.Set("x-client-id", "zomato_web_merchant")
	h.Set("x-zomato-app-version", "2")
	h.Set("x-zomato-source-identifier", "merchant-dashboard")
	h.Set("x-zomato-mx-csrf-token", csrf)
	h.Set("x-zomato-csrft", a.mxCSRFTHeader())
	return h
}

func (a *Auth) merchantAPIHeaders(csrf string) http.Header {
	h := a.apiHeaders(csrf)
	h.Set("referer", "https://www.zomato.com/partners/onlineordering/orderHistory/")
	h.Set("origin", "https://www.zomato.com")
	h.Set("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	return h
}

func (a *Auth) do(ctx context.Context, client *http.Client, method, url string, body []byte) (*http.Response, error) {
	resp, err := a.doOnce(ctx, client, method, url, body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 419 {
		return resp, nil
	}
	resp.Body.Close()
	a.CSRFToken = ""
	a.CSRFRefreshedAt = nil
	return a.doOnce(ctx, client, method, url, body)
}

func (a *Auth) doOnce(ctx context.Context, client *http.Client, method, url string, body []byte) (*http.Response, error) {
	csrf, err := a.ensureCSRF(ctx, client)
	if err != nil {
		return nil, err
	}
	var r io.Reader
	if len(body) > 0 {
		r = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, r)
	if err != nil {
		return nil, err
	}
	if strings.Contains(url, "www.zomato.com/merchant-api/") {
		req.Header = a.merchantAPIHeaders(csrf)
	} else {
		req.Header = a.apiHeaders(csrf)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if isLoginRequired(resp.StatusCode) {
		resp.Body.Close()
		return nil, &AuthError{Code: "login_required", Message: "Zomato session expired — import a fresh partner session"}
	}
	return resp, nil
}

func (a *Auth) MarshalJSON() ([]byte, error) {
	type alias Auth
	return json.Marshal((*alias)(a))
}
