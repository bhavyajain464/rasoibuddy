import { UserShoppingItem } from '../types';

/** Quantity line for list UI — omits amount when qty is unset or zero. */
export function formatShoppingQty(item: Pick<UserShoppingItem, 'qty' | 'unit'>): string {
  if (!item.qty || item.qty <= 0) {
    return item.unit || 'pcs';
  }
  return `${item.qty} ${item.unit}`;
}

export function parseShoppingQtyInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
