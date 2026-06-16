import { UserShoppingItem } from '../types';
import { parseQtyInput } from './qty';
import { pantryQtyLabel } from './inventoryBuckets';

/** Quantity line for list UI — uses server display_qty when present. */
export function formatShoppingQty(
  item: Pick<UserShoppingItem, 'name' | 'qty' | 'unit' | 'display_qty'>,
): string {
  return pantryQtyLabel(item);
}

export function parseShoppingQtyInput(raw: string): number {
  return parseQtyInput(raw);
}
