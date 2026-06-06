package zomato

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	connectSessionTTL   = 15 * time.Minute
	connectStatusPending   = "pending"
	connectStatusConnected = "connected"
	connectStatusFailed    = "failed"
)

func ConnectStatusConnected() string { return connectStatusConnected }

var zomatoHosts = map[string]bool{
	"www.zomato.com":      true,
	"partners.zomato.com": true,
	"api.zomato.com":      true,
	"zomato.com":          true,
}

type ConnectSession struct {
	Token     string    `json:"token"`
	KitchenID string    `json:"kitchen_id"`
	UserID    string    `json:"-"`
	Status    string    `json:"status"`
	Error     string    `json:"error,omitempty"`
	ExpiresAt time.Time `json:"expires_at"`
	LoginURL  string    `json:"login_url"`
	ConnectURL string   `json:"connect_url"`
}

type connectSessionState struct {
	session ConnectSession
	jar     http.CookieJar
}

type connectStore struct {
	mu       sync.RWMutex
	sessions map[string]*connectSessionState
}

func newConnectStore() *connectStore {
	s := &connectStore{sessions: map[string]*connectSessionState{}}
	go s.reapLoop()
	return s
}

func (s *connectStore) reapLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for token, st := range s.sessions {
			if now.After(st.session.ExpiresAt) {
				delete(s.sessions, token)
			}
		}
		s.mu.Unlock()
	}
}

func (svc *Service) connectStore() *connectStore {
	if svc.connect == nil {
		svc.connect = newConnectStore()
	}
	return svc.connect
}

func newConnectToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (svc *Service) StartConnect(ctx context.Context, kitchenID, userID, publicBaseURL string) (*ConnectSession, error) {
	token, err := newConnectToken()
	if err != nil {
		return nil, err
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	base := strings.TrimRight(publicBaseURL, "/")
	loginURL := base + "/api/v1/public/zomato/connect/" + token + "/h/www.zomato.com/partners/login"
	connectURL := base + "/api/v1/public/zomato/connect/" + token
	expires := time.Now().Add(connectSessionTTL)
	session := ConnectSession{
		Token:      token,
		KitchenID:  kitchenID,
		UserID:     userID,
		Status:     connectStatusPending,
		ExpiresAt:  expires,
		LoginURL:   loginURL,
		ConnectURL: connectURL,
	}
	svc.connectStore().mu.Lock()
	svc.connectStore().sessions[token] = &connectSessionState{session: session, jar: jar}
	svc.connectStore().mu.Unlock()
	return &session, nil
}

func (svc *Service) GetConnectSession(token string) (*ConnectSession, bool) {
	svc.connectStore().mu.RLock()
	defer svc.connectStore().mu.RUnlock()
	st, ok := svc.connectStore().sessions[token]
	if !ok || time.Now().After(st.session.ExpiresAt) {
		return nil, false
	}
	out := st.session
	return &out, true
}

func (svc *Service) getConnectState(token string) (*connectSessionState, bool) {
	svc.connectStore().mu.RLock()
	defer svc.connectStore().mu.RUnlock()
	st, ok := svc.connectStore().sessions[token]
	if !ok || time.Now().After(st.session.ExpiresAt) {
		return nil, false
	}
	return st, true
}

func (svc *Service) markConnectFailed(token, msg string) {
	svc.connectStore().mu.Lock()
	defer svc.connectStore().mu.Unlock()
	st, ok := svc.connectStore().sessions[token]
	if !ok {
		return
	}
	st.session.Status = connectStatusFailed
	st.session.Error = msg
}

func (svc *Service) markConnectConnected(ctx context.Context, token string, auth *Auth) error {
	svc.connectStore().mu.Lock()
	st, ok := svc.connectStore().sessions[token]
	if !ok {
		svc.connectStore().mu.Unlock()
		return fmt.Errorf("connect session expired")
	}
	kitchenID := st.session.KitchenID
	st.session.Status = connectStatusConnected
	svc.connectStore().mu.Unlock()

	if err := svc.ImportAuth(ctx, kitchenID, auth); err != nil {
		svc.markConnectFailed(token, err.Error())
		return err
	}
	return nil
}

func (svc *Service) CompleteConnectWithCookies(ctx context.Context, token, kitchenID string, auth *Auth) error {
	st, ok := svc.getConnectState(token)
	if !ok {
		return fmt.Errorf("connect session expired")
	}
	if st.session.KitchenID != kitchenID {
		return fmt.Errorf("connect session does not match kitchen")
	}
	if st.session.Status == connectStatusConnected {
		return nil
	}
	if err := svc.verifyAuth(ctx, auth, ""); err != nil {
		return err
	}
	return svc.markConnectConnected(ctx, token, auth)
}

func jarToAuth(jar http.CookieJar) (*Auth, error) {
	hosts := []string{
		"https://www.zomato.com/",
		"https://partners.zomato.com/",
		"https://api.zomato.com/",
		"https://zomato.com/",
	}
	seen := map[string]struct{}{}
	var cookies []Cookie
	for _, host := range hosts {
		u, _ := url.Parse(host)
		for _, c := range jar.Cookies(u) {
			key := c.Name + "|" + c.Domain + "|" + c.Path
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			cookies = append(cookies, Cookie{
				Name:     c.Name,
				Value:    c.Value,
				Domain:   c.Domain,
				Path:     c.Path,
				Expires:  c.Expires.Unix(),
				HTTPOnly: c.HttpOnly,
				Secure:   c.Secure,
			})
		}
	}
	if len(cookies) == 0 {
		return nil, fmt.Errorf("no Zomato cookies captured yet — finish partner login")
	}
	return &Auth{Cookies: cookies}, nil
}

func (svc *Service) tryCompleteConnectFromJar(ctx context.Context, token string, jar http.CookieJar, pageURL string) {
	if !looksLikeZomatoLoginSuccess(pageURL) {
		return
	}
	st, ok := svc.getConnectState(token)
	if !ok || st.session.Status == connectStatusConnected {
		return
	}
	auth, err := jarToAuth(jar)
	if err != nil {
		return
	}
	if err := svc.verifyAuth(ctx, auth, ""); err != nil {
		return
	}
	_ = svc.markConnectConnected(ctx, token, auth)
}

func looksLikeZomatoLoginSuccess(reqURL string) bool {
	u, err := url.Parse(reqURL)
	if err != nil {
		return false
	}
	path := strings.ToLower(u.Path)
	if strings.Contains(path, "/partners/login") || strings.HasSuffix(path, "/login") {
		return false
	}
	if strings.Contains(path, "/static/") ||
		strings.Contains(path, "remoteentry") ||
		strings.HasSuffix(path, ".js") ||
		strings.HasSuffix(path, ".css") ||
		strings.HasSuffix(path, ".map") ||
		strings.HasSuffix(path, ".png") ||
		strings.HasSuffix(path, ".woff") ||
		strings.HasSuffix(path, ".woff2") ||
		strings.HasSuffix(path, ".svg") {
		return false
	}
	successPaths := []string{
		"/partners/dashboard",
		"/partners/home",
		"/partners/orders",
		"/partners/outlet",
		"/partners/order-history",
		"/partners/business",
	}
	for _, p := range successPaths {
		if strings.HasPrefix(path, p) || strings.Contains(path, p+"/") {
			return true
		}
	}
	return false
}

func proxyURL(connectBase, host, path string) string {
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return connectBase + "/h/" + host + path
}

func rewriteZomatoURL(connectBase, defaultHost, raw string) string {
	if raw == "" {
		return raw
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if parsed.Host == "" {
		if strings.HasPrefix(raw, "/") {
			return proxyURL(connectBase, defaultHost, raw)
		}
		return raw
	}
	host := strings.ToLower(parsed.Host)
	if !zomatoHosts[host] {
		return raw
	}
	path := parsed.Path
	if path == "" {
		path = "/"
	}
	if parsed.RawQuery != "" {
		path += "?" + parsed.RawQuery
	}
	return proxyURL(connectBase, host, path)
}
