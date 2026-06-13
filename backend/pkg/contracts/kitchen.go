package contracts

import (
	"context"
	"time"
)

const (
	KitchenKindHousehold  = "household"
	KitchenKindRestaurant = "restaurant"

	RoleOwner   = "owner"
	RoleManager = "manager"
	RoleStaff   = "staff"
	RoleMember  = "member"
)

// Kitchen is a stock tenant (household or restaurant outlet).
type Kitchen struct {
	KitchenID  string
	Name       string
	InviteCode string
	Kind       string
	PlanTier   *string
	CreatedBy  *string
	CreatedAt  time.Time
}

// KitchenMember links a user to a kitchen with a role.
type KitchenMember struct {
	KitchenID string
	UserID    string
	Role      string
	JoinedAt  time.Time
}

// KitchenService manages kitchen tenancy and membership.
type KitchenService interface {
	GetKitchen(ctx context.Context, kitchenID string) (*Kitchen, error)
	ListRestaurantMemberships(ctx context.Context, userID string) ([]KitchenMember, error)
	GetMembership(ctx context.Context, kitchenID, userID string) (*KitchenMember, error)
	CreateRestaurantKitchen(ctx context.Context, ownerUserID, name string) (*Kitchen, error)
	AddMember(ctx context.Context, kitchenID, userID, role string) error
	UpdateMemberRole(ctx context.Context, kitchenID, userID, role string) error
	RemoveMember(ctx context.Context, kitchenID, userID string) error
	ListMembers(ctx context.Context, kitchenID string) ([]KitchenMember, error)
	SetPlanTier(ctx context.Context, kitchenID, planTier string) error
}
