export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  picture_url?: string;
};

export type KitchenRef = {
  kitchen_id: string;
  role: string;
};

export type MenuItem = {
  menu_item_id: string;
  name: string;
  price_cents: number;
  category: string;
  is_active: boolean;
};

export type MenuListPage = {
  items: MenuItem[];
  next_cursor?: string;
  has_more: boolean;
  total_count: number;
  category_counts: Record<string, number>;
  ingredients_by_item?: Record<string, RecipeIngredient[]>;
};

export type RecipeIngredient = {
  ingredient_id?: string;
  recipe_id?: string;
  ingredient_name: string;
  qty: number;
  unit: string;
  waste_factor?: number;
  inventory_item_id?: string;
  sort_order?: number;
};

export type OrderLine = {
  line_id: string;
  order_id: string;
  menu_item_id?: string;
  menu_item_name: string;
  qty: number;
  unit_price_cents?: number;
  line_total_cents?: number;
};

export type OrderIngredientUsed = {
  item_id: string;
  name: string;
  qty: number;
  unit: string;
};

export type Order = {
  order_id: string;
  external_order_id?: string;
  status: string;
  source?: string;
  total_cents?: number;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  voided_at?: string;
  lines?: OrderLine[];
  items_summary?: string;
  ingredients_used?: OrderIngredientUsed[];
};

export type OrderStatusCounts = {
  all: number;
  in_process: number;
  processed: number;
  open: number;
  void: number;
};

export type OrderListPage = {
  orders: Order[];
  next_cursor?: string;
  has_more: boolean;
  status_counts: OrderStatusCounts;
};

export type InventoryRow = {
  item_id: string;
  canonical_name: string;
  qty: number;
  unit: string;
  food_group?: string;
};

export type InventoryListPage = {
  items: InventoryRow[];
  next_cursor?: string;
  has_more: boolean;
  total_count: number;
  low_stock_count: number;
  food_group_counts: Record<string, number>;
};

export type ShoppingRow = {
  id: string;
  name: string;
  qty: number;
  unit: string;
};
