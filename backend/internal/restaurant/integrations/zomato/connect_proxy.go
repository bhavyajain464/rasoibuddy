package zomato

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strings"
)

var (
	htmlURLRe      = regexp.MustCompile(`(?i)(https?:)?//([a-z0-9.-]*zomato\.com[^"'\\s]*)`)
	htmlAttrPathRe = regexp.MustCompile(`(?i)\b(src|href|action|content)\s*=\s*("|')(/[^"'#?\s][^"']*)("|')`)
	cssURLPathRe   = regexp.MustCompile(`(?i)url\(\s*['"]?(/[^)'"]+)['"]?\s*\)`)
)

func isZomatoRootPath(path string) bool {
	p := strings.ToLower(path)
	prefixes := []string{
		"/partners/",
		"/merchant-api/",
		"/merchant-gw/",
		"/restaurant-partners/",
		"/menu-dashboard/",
		"/outlet-finance/",
		"/ads/",
	}
	for _, pref := range prefixes {
		if strings.HasPrefix(p, pref) {
			return true
		}
	}
	return false
}

func connectBaseURL(r *http.Request, token string) string {
	if v := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); v != "" {
		scheme := strings.TrimSpace(strings.Split(v, ",")[0])
		return scheme + "://" + r.Host + "/api/v1/public/zomato/connect/" + token
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host + "/api/v1/public/zomato/connect/" + token
}

func (svc *Service) ConnectProxy(token, host, path string, w http.ResponseWriter, r *http.Request) {
	st, ok := svc.getConnectState(token)
	if !ok {
		http.Error(w, "connect session expired", http.StatusNotFound)
		return
	}
	host = strings.ToLower(strings.TrimSpace(host))
	if !zomatoHosts[host] {
		http.Error(w, "invalid host", http.StatusBadRequest)
		return
	}
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	target := "https://" + host + path
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}

	connectBase := connectBaseURL(r, token)

	targetURL, err := url.Parse(target)
	if err != nil {
		http.Error(w, "bad target", http.StatusBadRequest)
		return
	}

	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL = targetURL
			req.Host = host
			req.Header.Set("Host", host)
			req.Header.Del("Accept-Encoding")
			if st.jar != nil {
				for _, c := range st.jar.Cookies(targetURL) {
					req.AddCookie(c)
				}
			}
			if ref := req.Header.Get("Referer"); ref != "" {
				req.Header.Set("Referer", rewriteZomatoURL(connectBase, host, ref))
			}
			if origin := req.Header.Get("Origin"); origin != "" {
				if parsed, err := url.Parse(origin); err == nil && zomatoHosts[strings.ToLower(parsed.Host)] {
					req.Header.Set("Origin", "https://"+parsed.Host)
				}
			}
		},
		ModifyResponse: func(resp *http.Response) error {
			if st.jar != nil {
				st.jar.SetCookies(targetURL, resp.Cookies())
			}
			if loc := resp.Header.Get("Location"); loc != "" {
				resp.Header.Set("Location", rewriteZomatoURL(connectBase, host, loc))
			}
			ct := resp.Header.Get("Content-Type")
			if shouldRewriteBody(ct, path) {
				body, err := readProxyBody(resp)
				if err != nil {
					return err
				}
				rewritten := rewriteBodyURLs(connectBase, host, body, isJavaScriptContent(ct, path))
				resp.Body = io.NopCloser(bytes.NewReader(rewritten))
				resp.ContentLength = int64(len(rewritten))
				resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(rewritten)))
				resp.Header.Del("Content-Encoding")
			}
			if looksLikeZomatoLoginSuccess(targetURL.String()) {
				svc.tryCompleteConnectFromJar(context.Background(), token, st.jar, targetURL.String())
			}
			return nil
		},
		ErrorHandler: func(_ http.ResponseWriter, _ *http.Request, err error) {
			svc.markConnectFailed(token, err.Error())
		},
	}
	proxy.ServeHTTP(w, r)
}

func isJavaScriptContent(contentType, path string) bool {
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "javascript") {
		return true
	}
	return strings.HasSuffix(strings.ToLower(path), ".js")
}

func readProxyBody(resp *http.Response) ([]byte, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") {
		gr, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return body, nil
		}
		defer gr.Close()
		decoded, err := io.ReadAll(gr)
		if err != nil {
			return body, nil
		}
		return decoded, nil
	}
	return body, nil
}

func shouldRewriteBody(contentType, path string) bool {
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "text/html") ||
		strings.Contains(ct, "javascript") ||
		strings.Contains(ct, "json") ||
		strings.Contains(ct, "text/css") ||
		strings.Contains(ct, "application/xml") {
		return true
	}
	if contentType == "" && strings.Contains(path, "/partners/") {
		return true
	}
	return false
}

func rewriteBodyURLs(connectBase, host string, body []byte, jsSafeOnly bool) []byte {
	partnerPrefix := proxyURL(connectBase, host, "/partners/")
	out := bytes.ReplaceAll(body, []byte(`="/partners/`), []byte(`="`+partnerPrefix))
	out = bytes.ReplaceAll(out, []byte(`='/partners/`), []byte(`='`+partnerPrefix))

	out = htmlURLRe.ReplaceAllFunc(out, func(match []byte) []byte {
		s := string(match)
		if strings.HasPrefix(s, "//") {
			s = "https:" + s
		} else if !strings.HasPrefix(s, "http") {
			s = "https://" + strings.TrimPrefix(s, "//")
		}
		return []byte(rewriteZomatoURL(connectBase, host, s))
	})

	if jsSafeOnly {
		return out
	}

	out = htmlAttrPathRe.ReplaceAllFunc(out, func(match []byte) []byte {
		parts := htmlAttrPathRe.FindSubmatch(match)
		if len(parts) < 5 {
			return match
		}
		p := string(parts[3])
		if !isZomatoRootPath(p) {
			return match
		}
		attr := string(parts[1])
		quote := string(parts[2])
		endQuote := string(parts[4])
		return []byte(attr + "=" + quote + proxyURL(connectBase, host, p) + endQuote)
	})
	out = cssURLPathRe.ReplaceAllFunc(out, func(match []byte) []byte {
		parts := cssURLPathRe.FindSubmatch(match)
		if len(parts) < 2 {
			return match
		}
		p := string(parts[1])
		if !isZomatoRootPath(p) {
			return match
		}
		return []byte("url(" + proxyURL(connectBase, host, p) + ")")
	})
	return out
}
