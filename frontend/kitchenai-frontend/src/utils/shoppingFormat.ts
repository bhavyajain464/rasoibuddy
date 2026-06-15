import { UserShoppingItem } from '../types';
import { parseQtyInput } from './qty';
import { resolveCatalogItem } from './ingredientUnits';
import { formatPurchaseQty } from './purchaseUnits';
import type { CatalogIngredient } from '../types';

/** Quantity line for list UI — purchase-style (e.g. "2" lemons, "1 kg" rice). */
export function formatShoppingQty(
  item: Pick<UserShoppingItem, 'name' | 'qty' | 'unit'>,
  catalog?: CatalogIngredient[],
): string {
  const match = catalog?.length
    ? resolveCatalogItem(catalog, undefined, item.name)
    : undefined;
  return formatPurchaseQty(item.qty, item.unit, match);
}

export function parseShoppingQtyInput(raw: string): number {
  return parseQtyInput(raw);
}
