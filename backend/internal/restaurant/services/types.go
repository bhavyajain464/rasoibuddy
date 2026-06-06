package services

import "time"

type MenuItem struct {
	MenuItemID string    `json:"menu_item_id"`
	KitchenID  string    `json:"kitchen_id"`
	Name       string    `json:"name"`
	Category   string    `json:"category"`
	PriceCents int       `json:"price_cents"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type RecipeIngredient struct {
	IngredientID      string  `json:"ingredient_id"`
	RecipeID          string  `json:"recipe_id"`
	IngredientName    string  `json:"ingredient_name"`
	Qty               float64 `json:"qty"`
	Unit              string  `json:"unit"`
	WasteFactor       float64 `json:"waste_factor"`
	InventoryItemID   *string `json:"inventory_item_id,omitempty"`
	SortOrder         int     `json:"sort_order"`
}

type Order struct {
	OrderID           string                `json:"order_id"`
	ExternalOrderID   string                `json:"external_order_id,omitempty"`
	KitchenID         string                `json:"kitchen_id"`
	CreatedBy         string                `json:"created_by"`
	Status            string                `json:"status"`
	Source            string                `json:"source"`
	TotalCents        int                   `json:"total_cents"`
	Lines             []OrderLine           `json:"lines"`
	ItemsSummary      string                `json:"items_summary,omitempty"`
	IngredientsUsed   []OrderIngredientUsed `json:"ingredients_used,omitempty"`
	CompletedAt       *time.Time            `json:"completed_at,omitempty"`
	VoidedAt          *time.Time            `json:"voided_at,omitempty"`
	CreatedAt         time.Time             `json:"created_at"`
	UpdatedAt         time.Time             `json:"updated_at"`
}

type OrderLine struct {
	LineID          string `json:"line_id"`
	OrderID         string `json:"order_id"`
	MenuItemID      string `json:"menu_item_id,omitempty"`
	MenuItemName    string `json:"menu_item_name"`
	Qty             int    `json:"qty"`
	UnitPriceCents  int    `json:"unit_price_cents,omitempty"`
	LineTotalCents  int    `json:"line_total_cents,omitempty"`
}

type OrderIngredientUsed struct {
	ItemID string  `json:"item_id"`
	Name   string  `json:"name"`
	Qty    float64 `json:"qty"`
	Unit   string  `json:"unit"`
}

type OrderStatusCounts struct {
	All        int `json:"all"`
	InProcess  int `json:"in_process"`
	Processed  int `json:"processed"`
	Open       int `json:"open"`
	Void       int `json:"void"`
}

type OrderListPage struct {
	Orders        []Order           `json:"orders"`
	NextCursor    string            `json:"next_cursor,omitempty"`
	HasMore       bool              `json:"has_more"`
	StatusCounts  OrderStatusCounts `json:"status_counts"`
}

type ListOrdersParams struct {
	Limit  int
	Cursor string
	Status string
}

type MenuListPage struct {
	Items             []MenuItem                    `json:"items"`
	NextCursor        string                        `json:"next_cursor,omitempty"`
	HasMore           bool                          `json:"has_more"`
	TotalCount        int                           `json:"total_count"`
	CategoryCounts    map[string]int                `json:"category_counts"`
	IngredientsByItem map[string][]RecipeIngredient `json:"ingredients_by_item,omitempty"`
}

type ListMenuParams struct {
	Limit              int
	Cursor             string
	Category           string
	ActiveOnly         bool
	IncludeIngredients bool
}

type UsageReportRow struct {
	Date      string  `json:"date"`
	FoodGroup string  `json:"food_group"`
	TotalQty  float64 `json:"total_qty"`
	ItemCount int     `json:"item_count"`
}

type KitchenMemberView struct {
	UserID   string `json:"user_id"`
	Email    string `json:"email,omitempty"`
	Name     string `json:"name,omitempty"`
	Role     string `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type BillingPlan struct {
	KitchenID string `json:"kitchen_id"`
	PlanTier  string `json:"plan_tier"`
	Features  map[string]bool `json:"features"`
}
