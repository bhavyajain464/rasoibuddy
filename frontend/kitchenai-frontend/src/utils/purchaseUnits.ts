import type { CatalogIngredient } from '../types';
import { normalizeUnit } from './units';

/** Typical buy qty for a catalog ingredient (how people shop, not recipe amounts). */
const PURCHASE_QTY_BY_ID: Record<string, number> = {
  lemon: 2,
  lime: 2,
  egg: 6,
  eggs: 6,
  watermelon: 1,
  muskmelon: 1,
  papaya: 1,
  pineapple: 1,
  jackfruit: 1,
  kiwi: 4,
  avocado: 2,
  coconut: 1,
  banana: 6,
};

function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Bought by count (pieces), not weight/volume — hide the "pcs" label in UI. */
export function isCountPurchased(
  item?: CatalogIngredient | null,
  unit?: string,
): boolean {
  const u = normalizeUnit(unit ?? item?.default_unit);
  if (u !== 'pcs') return false;
  const allowed = (item?.units ?? [item?.default_unit])
    .map((x) => normalizeUnit(x))
    .filter(Boolean);
  if (allowed.length !== 1 || allowed[0] !== 'pcs') return false;

  const id = item?.ingredient_id;
  if (id && PURCHASE_QTY_BY_ID[id] != null) return true;
  if (id === 'egg') return true;

  const group = item?.food_group ?? '';
  return group === 'fruits';
}

/** Default quantity when adding to cart / shopping without a specific amount. */
export function defaultPurchaseQty(
  item?: CatalogIngredient | null,
  unit?: string,
): number {
  const u = normalizeUnit(unit ?? item?.default_unit);
  const id = item?.ingredient_id;
  if (id && PURCHASE_QTY_BY_ID[id] != null) {
    return PURCHASE_QTY_BY_ID[id];
  }

  switch (u) {
    case 'g':
      return item?.food_group === 'spices' ? 100 : 250;
    case 'ml':
      return 500;
    case 'kg':
    case 'L':
      return 1;
    case 'pcs':
      if (item?.food_group === 'fruits') return 2;
      if (id === 'egg') return 6;
      if (item?.food_group === 'spices') return 1;
      return 2;
    default:
      return 1;
  }
}

/** Human-readable qty for lists — count items show "2", weight shows "1 kg". */
export function formatPurchaseQty(
  qty: number,
  unit: string | undefined | null,
  item?: CatalogIngredient | null,
): string {
  const u = normalizeUnit(unit ?? item?.default_unit);
  if (!qty || qty <= 0) {
    if (isCountPurchased(item, u)) return '';
    return u;
  }
  if (isCountPurchased(item, u)) {
    return formatQty(qty);
  }
  return `${formatQty(qty)} ${u}`;
}
