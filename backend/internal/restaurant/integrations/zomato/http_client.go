package zomato

import (
	"net"
	"net/http"
	"strings"
	"time"
)

func newZomatoHTTPClient() *http.Client {
	h2 := http.DefaultTransport.(*http.Transport).Clone()
	h1 := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     false,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	return &http.Client{
		Timeout: 120 * time.Second,
		Transport: &hostTransport{
			h1: h1,
			h2: h2,
		},
	}
}

type hostTransport struct {
	h1 http.RoundTripper
	h2 http.RoundTripper
}

func (t *hostTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	host := strings.ToLower(req.URL.Host)
	if strings.HasPrefix(host, "www.zomato.com") {
		return t.h1.RoundTrip(req)
	}
	return t.h2.RoundTrip(req)
}
