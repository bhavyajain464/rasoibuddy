package services

import (
	"context"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/contracts"
)

var restaurantPlanFeatures = map[string]map[string]bool{
	"starter": {
		"pos":           true,
		"menu":          true,
		"inventory":     true,
		"reports_basic": true,
	},
	"pro": {
		"pos":           true,
		"menu":          true,
		"inventory":     true,
		"reports_basic": true,
		"reports_advanced": true,
		"staff_unlimited": true,
	},
	"enterprise": {
		"pos":              true,
		"menu":             true,
		"inventory":        true,
		"reports_basic":    true,
		"reports_advanced": true,
		"staff_unlimited":  true,
		"intelligence":     true,
	},
}

type BillingService struct {
	kitchen contracts.KitchenService
}

func NewBillingService(kitchen contracts.KitchenService) *BillingService {
	return &BillingService{kitchen: kitchen}
}

func (s *BillingService) GetPlan(ctx context.Context, kitchenID string) (*BillingPlan, error) {
	k, err := s.kitchen.GetKitchen(ctx, kitchenID)
	if err != nil {
		return nil, err
	}
	if k == nil || k.Kind != contracts.KitchenKindRestaurant {
		return nil, fmt.Errorf("restaurant kitchen not found")
	}
	tier := "starter"
	if k.PlanTier != nil && *k.PlanTier != "" {
		tier = *k.PlanTier
	}
	features, ok := restaurantPlanFeatures[tier]
	if !ok {
		features = restaurantPlanFeatures["starter"]
	}
	return &BillingPlan{
		KitchenID: kitchenID,
		PlanTier:  tier,
		Features:  features,
	}, nil
}

func (s *BillingService) SetPlan(ctx context.Context, kitchenID, planTier string) (*BillingPlan, error) {
	planTier = strings.ToLower(strings.TrimSpace(planTier))
	if _, ok := restaurantPlanFeatures[planTier]; !ok {
		return nil, fmt.Errorf("invalid plan_tier")
	}
	if err := s.kitchen.SetPlanTier(ctx, kitchenID, planTier); err != nil {
		return nil, err
	}
	return s.GetPlan(ctx, kitchenID)
}

func (s *BillingService) HasFeature(plan *BillingPlan, feature string) bool {
	if plan == nil {
		return false
	}
	return plan.Features[feature]
}
