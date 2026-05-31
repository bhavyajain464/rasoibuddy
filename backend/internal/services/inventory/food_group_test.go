package inventory

import "testing"

func TestNormalizeFoodGroup(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"vegetables", "vegetables"},
		{"Vegetables", "vegetables"},
		{"grains", "grains_pulses"},
		{"protein", "non_veg"},
		{"chicken", "non_veg"},
		{"unknown_stuff", "other"},
		{"", "other"},
	}
	for _, tc := range cases {
		if got := NormalizeFoodGroup(tc.raw); got != tc.want {
			t.Errorf("NormalizeFoodGroup(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestNormalizeFoodGroupForVegetarian(t *testing.T) {
	if got := NormalizeFoodGroupForDietary("chicken", []string{"vegetarian"}); got != "other" {
		t.Fatalf("veg user chicken = %q, want other", got)
	}
	if got := NormalizeFoodGroupForDietary("chicken", []string{"non-veg"}); got != "non_veg" {
		t.Fatalf("non-veg user chicken = %q, want non_veg", got)
	}
}

func TestListFoodGroupsForDietary(t *testing.T) {
	all := ListFoodGroups()
	veg := ListFoodGroupsForDietary([]string{"vegetarian"})
	if len(veg) != len(all)-1 {
		t.Fatalf("veg groups len %d, want %d", len(veg), len(all)-1)
	}
	for _, g := range veg {
		if g.ID == "non_veg" {
			t.Fatal("non_veg should be hidden for vegetarian")
		}
	}
}

func TestListFoodGroups(t *testing.T) {
	groups := ListFoodGroups()
	if len(groups) < 5 {
		t.Fatalf("expected several groups, got %d", len(groups))
	}
	if groups[0].ID != "vegetables" {
		t.Fatalf("first group should be vegetables, got %s", groups[0].ID)
	}
}
