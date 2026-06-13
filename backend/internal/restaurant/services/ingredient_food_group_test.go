package services

import "testing"

func TestInferFoodGroupFromName(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"Ajwain", "spices"},
		{"Basmati Rice", "grains_pulses"},
		{"Bay Leaf", "spices"},
		{"Bell Peppers", "vegetables"},
		{"Besan", "grains_pulses"},
		{"Biryani Masala", "spices"},
		{"Bread", "bakery"},
		{"Butter", "dairy"},
		{"Cooking Oil", "oils_fats"},
		{"Coriander Powder", "spices"},
		{"Coriander", "vegetables"},
		{"Curd", "dairy"},
		{"Garam Masala", "spices"},
		{"Chicken", "non_veg"},
		{"Tomato", "vegetables"},
		{"French Beans", "vegetables"},
		{"Cashew", "other"},
	}
	for _, tc := range cases {
		if got := InferFoodGroupFromName(tc.name); got != tc.want {
			t.Errorf("InferFoodGroupFromName(%q) = %q, want %q", tc.name, got, tc.want)
		}
	}
}
