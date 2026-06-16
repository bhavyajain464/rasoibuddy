package models

import (
	"database/sql"
	"time"
)

// ItemCatalog is resolved catalog metadata attached to pantry/shopping API rows.
type ItemCatalog struct {
	IngredientID string   `json:"ingredient_id"`
	Name         string   `json:"name"`
	DefaultUnit  string   `json:"default_unit"`
	Units        []string `json:"units,omitempty"`
	FoodGroup    string   `json:"food_group,omitempty"`
}

// Inventory represents an item in the pantry/fridge
type Inventory struct {
	ItemID          string       `json:"item_id"`
	IngredientID    string       `json:"ingredient_id,omitempty"`
	CanonicalName   string       `json:"canonical_name"`
	Qty             float64      `json:"qty"`
	Unit            string       `json:"unit"`
	FoodGroup       string       `json:"food_group"`
	DisplayQty      string       `json:"display_qty,omitempty"`
	Catalog         *ItemCatalog `json:"catalog,omitempty"`
	EstimatedExpiry *time.Time   `json:"estimated_expiry,omitempty"`
	IsManual        bool         `json:"is_manual"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

// InventoryRequest represents the payload for creating inventory
type InventoryRequest struct {
	CanonicalName   string  `json:"canonical_name" validate:"required"`
	Qty             float64 `json:"qty" validate:"required,gt=0"`
	Unit            string  `json:"unit" validate:"required"`
	EstimatedExpiry string  `json:"estimated_expiry,omitempty"`
	FoodGroup       string  `json:"food_group,omitempty"`
	IsManual        bool    `json:"is_manual"`
}

// InventoryPatchRequest updates only fields present in the JSON body (omitted = unchanged).
// estimated_expiry: omit = no change; "" = clear; "YYYY-MM-DD" = set.
type InventoryPatchRequest struct {
	CanonicalName   *string  `json:"canonical_name,omitempty"`
	Qty             *float64 `json:"qty,omitempty"`
	Unit            *string  `json:"unit,omitempty"`
	EstimatedExpiry *string  `json:"estimated_expiry,omitempty"`
	IsManual        *bool    `json:"is_manual,omitempty"`
}

func (p InventoryPatchRequest) IsEmpty() bool {
	return p.CanonicalName == nil && p.Qty == nil && p.Unit == nil && p.EstimatedExpiry == nil && p.IsManual == nil
}

// User represents a user account for authentication
type User struct {
	UserID     string    `json:"user_id"`
	GoogleID   string    `json:"google_id"`
	Email      string    `json:"email"`
	Name       string    `json:"name"`
	PictureURL string    `json:"picture_url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// UserPreferences represents user's dietary preferences and dislikes
type UserPreferences struct {
	UserID      string    `json:"user_id"`
	Dislikes    []string  `json:"dislikes"`
	DietaryTags []string  `json:"dietary_tags"`
	FavCuisines []string  `json:"fav_cuisines"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UserPreferencesRequest represents the payload for updating user preferences
type UserPreferencesRequest struct {
	Dislikes    []string `json:"dislikes"`
	DietaryTags []string `json:"dietary_tags"`
	FavCuisines []string `json:"fav_cuisines"`
}

// UserMemory represents free-form memory notes that influence meal suggestions
type UserMemory struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Category  string    `json:"category"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// UserProfile aggregates user info, preferences, and memory for the profile page
type UserProfile struct {
	User            User              `json:"user"`
	HouseholdSize   int               `json:"household_size"`
	Allergies       []string          `json:"allergies"`
	Dislikes        []string          `json:"dislikes"`
	DietaryTags     []string          `json:"dietary_tags"`
	FavCuisines     []string          `json:"fav_cuisines"`
	SpiceLevel      string            `json:"spice_level"`
	CookingSkill    string            `json:"cooking_skill"`
	Memories        []UserMemory      `json:"memories"`
	InventoryCount  int               `json:"inventory_count"`
	ExpiringCount   int               `json:"expiring_count"`
}

// UpdateProfileRequest is the payload for updating the full profile
type UpdateProfileRequest struct {
	HouseholdSize int      `json:"household_size"`
	Allergies     []string `json:"allergies"`
	Dislikes      []string `json:"dislikes"`
	DietaryTags   []string `json:"dietary_tags"`
	FavCuisines   []string `json:"fav_cuisines"`
	SpiceLevel    string   `json:"spice_level"`
	CookingSkill  string   `json:"cooking_skill"`
}

// AddMemoryRequest is the payload for adding a memory note
type AddMemoryRequest struct {
	Category string `json:"category"`
	Content  string `json:"content"`
}

// CookProfile represents cook's skills and language preferences
type CookProfile struct {
	CookID        string    `json:"cook_id,omitempty"`
	CookName      string    `json:"cook_name,omitempty"`
	DishesKnown   []string  `json:"dishes_known"`
	PreferredLang string    `json:"preferred_lang"`
	PhoneNumber   string    `json:"phone_number,omitempty"`
	Configured    bool      `json:"configured"`
	CreatedAt     time.Time `json:"created_at,omitempty"`
	UpdatedAt     time.Time `json:"updated_at,omitempty"`
}

// CookProfileRequest represents the payload for updating cook profile
type CookProfileRequest struct {
	CookName      string   `json:"cook_name,omitempty"`
	DishesKnown   []string `json:"dishes_known"`
	PreferredLang string   `json:"preferred_lang"`
	PhoneNumber   string   `json:"phone_number,omitempty"`
}

// InventoryBucketCounts summarizes disjoint pantry buckets for a kitchen.
type InventoryBucketCounts struct {
	Active   int `json:"active"`
	Expiring int `json:"expiring"`
	Expired  int `json:"expired"`
	Total    int `json:"total"`
}

// InventoryBucketsResponse is returned by GET /inventory?include=active,expiring,expired.
// Only requested bucket arrays are populated; counts always cover all buckets.
type InventoryBucketsResponse struct {
	Active   []Inventory    `json:"active,omitempty"`
	Expiring []ExpiringItem `json:"expiring,omitempty"`
	Expired  []ExpiringItem `json:"expired,omitempty"`
	Counts   InventoryBucketCounts `json:"counts"`
}

// ExpiringItem represents an inventory item that is near expiry
type ExpiringItem struct {
	ItemID          string       `json:"item_id"`
	IngredientID    string       `json:"ingredient_id,omitempty"`
	CanonicalName   string       `json:"canonical_name"`
	Qty             float64      `json:"qty"`
	Unit            string       `json:"unit"`
	FoodGroup       string       `json:"food_group,omitempty"`
	DisplayQty      string       `json:"display_qty,omitempty"`
	Catalog         *ItemCatalog `json:"catalog,omitempty"`
	EstimatedExpiry time.Time    `json:"estimated_expiry"`
	DaysUntilExpiry int          `json:"days_until_expiry"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

// NullString handles nullable strings from database
func NullString(s sql.NullString) *string {
	if s.Valid {
		return &s.String
	}
	return nil
}

// Ingredient represents an ingredient with quantity
type Ingredient struct {
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
}

// MealSuggestion represents a meal suggestion
type MealSuggestion struct {
	MealID      string       `json:"meal_id"`
	MealName    string       `json:"meal_name"`
	Ingredients []Ingredient `json:"ingredients"`
	CookID      string       `json:"cook_id"`
	CookingTime int          `json:"cooking_time"`
	Priority    float64      `json:"priority"`
	Date        time.Time    `json:"date"`
	Status      string       `json:"status"`
}

// ShoppingListItem represents an item in shopping list
type ShoppingListItem struct {
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Priority int     `json:"priority"`
}

// NullTime handles nullable times from database
func NullTime(t sql.NullTime) *time.Time {
	if t.Valid {
		return &t.Time
	}
	return nil
}
