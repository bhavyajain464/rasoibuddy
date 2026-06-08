package services

import (
	"os"
	"testing"
)

func TestParseZomatoMenu(t *testing.T) {
	path := os.Getenv("ZOMATO_MENU_PATH")
	if path == "" {
		path = "/Users/bhavyajain/Downloads/menu.json"
	}
	if _, err := os.Stat(path); err != nil {
		t.Skip("menu.json not available:", path)
	}

	dishes, err := ParseZomatoMenu(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(dishes) < 90 {
		t.Fatalf("expected ~93 dishes, got %d", len(dishes))
	}
	found := false
	for _, d := range dishes {
		if d.Name == "Dal Fry" && d.Category == "main course" && d.PriceCents == 18000 {
			found = true
		}
	}
	if !found {
		t.Fatal("expected Dal Fry in parsed menu")
	}
}
