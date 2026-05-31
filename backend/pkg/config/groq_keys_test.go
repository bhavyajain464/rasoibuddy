package config

import "testing"

func TestParseGroqAPIKeys(t *testing.T) {
	got := parseGroqAPIKeys(" key1 , key2,key3  , ,key4 ")
	if len(got) != 4 {
		t.Fatalf("len = %d, want 4: %v", len(got), got)
	}
	if got[0] != "key1" || got[1] != "key2" || got[2] != "key3" || got[3] != "key4" {
		t.Fatalf("unexpected keys: %v", got)
	}
	if parseGroqAPIKeys("") != nil {
		t.Fatal("empty env should yield nil slice")
	}
}

func TestPickGroqAPIKey(t *testing.T) {
	c := &Config{GroqAPIKeys: []string{"only"}}
	if c.PickGroqAPIKey() != "only" {
		t.Fatal("single key should return itself")
	}
	c = &Config{GroqAPIKeys: []string{"a", "b", "c"}}
	seen := map[string]bool{}
	for i := 0; i < 30; i++ {
		seen[c.PickGroqAPIKey()] = true
	}
	if len(seen) < 2 {
		t.Fatalf("expected variety across picks, got %v", seen)
	}
}
