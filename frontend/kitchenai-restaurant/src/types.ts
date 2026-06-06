// Product vocabulary: Outlet = business location (menu/stock/orders).
// kitchen_id in API responses is also exposed as outlet_id.

export type OutletRef = {
  /** Our outlet id (same as kitchen_id in legacy API). */
  outlet_id: string;
  /** @deprecated Use outlet_id — kept for backward compatibility. */
  kitchen_id: string;
  role: string;
  name?: string;
};

/** @deprecated Use OutletRef */
export type KitchenRef = OutletRef;

export type PartnerWorkerStatus = {
  partner: string;
  partner_outlet_id: string;
  partner_outlet_name?: string;
  status: string;
  last_sync_at?: string;
  last_error?: string;
  last_sync_message?: string;
  last_sync_ok?: boolean;
  orders_imported_count?: number;
  poll_interval_minutes?: number;
  next_poll_at?: string;
  sync_mode?: string;
  /** @deprecated Use partner_outlet_id */
  partner_store_id?: string;
  partner_store_name?: string;
  /** @deprecated Partner store id was wrongly named outlet_id */
  outlet_id?: string;
  outlet_name?: string;
};

export type OutletIntegrationsStatus = {
  session_saved?: boolean;
  poll_interval_minutes?: number;
  sync_mode?: string;
  workers: PartnerWorkerStatus[];
  /** @deprecated Use workers */
  outlets?: PartnerWorkerStatus[];
};

export function integrationWorkers(st: OutletIntegrationsStatus | null | undefined): PartnerWorkerStatus[] {
  if (!st) return [];
  return st.workers?.length ? st.workers : st.outlets ?? [];
}

export function workerStoreId(w: PartnerWorkerStatus): string {
  return w.partner_outlet_id || w.partner_store_id || w.outlet_id || '';
}

export function workerLabel(w: PartnerWorkerStatus): string {
  const id = workerStoreId(w);
  const name = w.partner_outlet_name?.trim() || w.partner_store_name?.trim() || w.outlet_name?.trim();
  const partner = w.partner?.trim() || 'partner';
  if (name && id) return `${partner}: ${name} (${id})`;
  if (name) return `${partner}: ${name}`;
  return id ? `${partner}: ${id}` : partner;
}

export type OutletMember = {
  user_id?: string;
  email?: string;
  name?: string;
  role: string;
  joined_at?: string;
  pending?: boolean;
};

export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  picture_url?: string;
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
