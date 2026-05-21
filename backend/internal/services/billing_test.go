package services

import (
	"testing"

	"kitchenai-backend/pkg/config"
)

func TestRazorpayConfigEnabled(t *testing.T) {
	if (config.RazorpayConfig{}).Enabled() {
		t.Fatal("empty config should not be enabled")
	}
	c := config.RazorpayConfig{KeyID: "rzp_test_x", KeySecret: "secret"}
	if !c.Enabled() {
		t.Fatal("expected enabled with keys")
	}
}
