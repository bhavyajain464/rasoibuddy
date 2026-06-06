package services

import (
	"context"
	"strings"
)

type ShoppingSeedSample struct {
	Name string
	Qty  float64
	Unit string
}

// DefaultRestaurantShoppingSamples are typical vendor items for an Indian veg restaurant kitchen.
var DefaultRestaurantShoppingSamples = []ShoppingSeedSample{
	{Name: "Paneer", Qty: 2, Unit: "kg"},
	{Name: "Cooking Oil", Qty: 5, Unit: "L"},
	{Name: "Tomato", Qty: 3, Unit: "kg"},
	{Name: "Onion", Qty: 5, Unit: "kg"},
	{Name: "Green Peas", Qty: 1, Unit: "kg"},
	{Name: "Basmati Rice", Qty: 10, Unit: "kg"},
	{Name: "Toor Dal", Qty: 5, Unit: "kg"},
	{Name: "Ginger", Qty: 500, Unit: "g"},
	{Name: "Garlic", Qty: 500, Unit: "g"},
	{Name: "Coriander Powder", Qty: 500, Unit: "g"},
	{Name: "Cumin Seeds", Qty: 200, Unit: "g"},
	{Name: "Fresh Cream", Qty: 1, Unit: "L"},
}

type ShoppingSeedResult struct {
	Added   []string `json:"added"`
	Skipped []string `json:"skipped"`
}

func (s *ShoppingService) SeedSamples(ctx context.Context, kitchenID, userID string) (*ShoppingSeedResult, error) {
	existing, err := s.List(ctx, kitchenID)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(existing))
	for _, item := range existing {
		seen[strings.ToLower(strings.TrimSpace(item.Name))] = struct{}{}
	}

	out := &ShoppingSeedResult{
		Added:   make([]string, 0),
		Skipped: make([]string, 0),
	}
	for _, sample := range DefaultRestaurantShoppingSamples {
		key := strings.ToLower(strings.TrimSpace(sample.Name))
		if _, ok := seen[key]; ok {
			out.Skipped = append(out.Skipped, sample.Name)
			continue
		}
		if _, err := s.Add(ctx, kitchenID, userID, sample.Name, sample.Qty, sample.Unit); err != nil {
			return nil, err
		}
		out.Added = append(out.Added, sample.Name)
		seen[key] = struct{}{}
	}
	return out, nil
}
