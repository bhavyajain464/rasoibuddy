package config

import (
	"os"
	"testing"
)

func TestLoadCommerceConfig_DisabledByDefault(t *testing.T) {
	t.Setenv("COMMERCE_ENABLED", "false")
	t.Setenv("COMMERCE_ENABLED_PARTNERS", "")
	t.Setenv("COMMERCE_MAX_PARTNERS", "")
	cfg := loadCommerceConfig()
	if cfg.Enabled {
		t.Fatal("expected commerce disabled by default")
	}
	if len(cfg.Partners) != 0 {
		t.Fatalf("expected no partners when disabled, got %d", len(cfg.Partners))
	}
}

func TestLoadCommerceConfig_WhitelistAndMax(t *testing.T) {
	t.Setenv("COMMERCE_ENABLED", "true")
	t.Setenv("COMMERCE_ENABLED_PARTNERS", "zepto,blinkit,instamart")
	t.Setenv("COMMERCE_MAX_PARTNERS", "2")
	t.Setenv("COMMERCE_DISABLED_PARTNERS", "")
	cfg := loadCommerceConfig()
	if !cfg.Enabled {
		t.Fatal("expected commerce enabled")
	}
	if len(cfg.Partners) != 2 {
		t.Fatalf("expected 2 partners, got %d", len(cfg.Partners))
	}
	if cfg.Partners[0].ID != "zepto" || cfg.Partners[1].ID != "blinkit" {
		t.Fatalf("unexpected partner order: %+v", cfg.Partners)
	}
}

func TestParseCommercePartnerIDs(t *testing.T) {
	got := parseCommercePartnerIDs(" Blinkit , zepto,blinkit ")
	if len(got) != 2 || got[0] != "blinkit" || got[1] != "zepto" {
		t.Fatalf("unexpected ids: %v", got)
	}
}

func TestLoadCommerceConfig_NoPartnersDisablesSurface(t *testing.T) {
	t.Setenv("COMMERCE_ENABLED", "true")
	t.Setenv("COMMERCE_ENABLED_PARTNERS", "unknown_store")
	cfg := loadCommerceConfig()
	if cfg.Enabled {
		t.Fatal("expected enabled=false when whitelist matches no known partners")
	}
	_ = os.Unsetenv("COMMERCE_ENABLED_PARTNERS")
}
