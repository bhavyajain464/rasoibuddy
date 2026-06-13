package zomato

import "testing"

func TestLooksLikeZomatoLoginSuccess(t *testing.T) {
	cases := []struct {
		url  string
		want bool
	}{
		{"https://www.zomato.com/partners/login", false},
		{"https://www.zomato.com/partners/static/js/main.js", false},
		{"https://www.zomato.com/partners/static/js/orderHistory.bba0db7f.chunk.js", false},
		{"https://www.zomato.com/partners/dashboard", true},
		{"https://www.zomato.com/partners/orders", true},
		{"https://www.zomato.com/partners/home", true},
	}
	for _, tc := range cases {
		if got := looksLikeZomatoLoginSuccess(tc.url); got != tc.want {
			t.Fatalf("looksLikeZomatoLoginSuccess(%q) = %v want %v", tc.url, got, tc.want)
		}
	}
}
