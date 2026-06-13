package services

import "testing"

func TestMatchMenuItemByName(t *testing.T) {
	items := []MenuItem{
		{MenuItemID: "1", Name: "Dal Fry", IsActive: true},
		{MenuItemID: "2", Name: "Veg Hyderabadi biryani", IsActive: true},
		{MenuItemID: "3", Name: "Chana Masala (Chole)", IsActive: true},
		{MenuItemID: "4", Name: "Plain Tawa Roti", IsActive: false},
	}

	tests := []struct {
		name string
		want string
	}{
		{"Dal Fry", "1"},
		{"dal fry", "1"},
		{"Veg Hyderabadi biryani", "2"},
		{"Aloo Chole", ""},
		{"Plain Tawa Roti", ""},
	}
	for _, tc := range tests {
		if got := MatchMenuItemByName(items, tc.name); got != tc.want {
			t.Fatalf("%q: got %q want %q", tc.name, got, tc.want)
		}
	}
}
