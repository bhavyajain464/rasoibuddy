import type { InventoryDraftRow } from '../components/inventory/InventoryItemRowEditor';
import { parseShoppingQtyInput } from './shoppingFormat';

export type InventoryItemPatch = {
  canonical_name?: string;
  qty?: number;
  unit?: string;
  estimated_expiry?: string;
  is_manual?: boolean;
};

/** Only fields the user changed since opening the edit sheet (for server merge under row lock). */
export function buildInventoryItemPatch(
  initial: InventoryDraftRow,
  draft: InventoryDraftRow,
): InventoryItemPatch {
  const patch: InventoryItemPatch = {};

  const initialName = initial.name.trim();
  const draftName = draft.name.trim();
  if (draftName !== initialName) {
    patch.canonical_name = draftName;
  }

  const initialQty = parseShoppingQtyInput(initial.qty);
  const draftQty = parseShoppingQtyInput(draft.qty);
  if (draftQty !== initialQty) {
    patch.qty = draftQty;
  }

  if ((draft.unit || '').trim() !== (initial.unit || '').trim()) {
    patch.unit = draft.unit;
  }

  const initialExpiry = initial.expiry.trim();
  const draftExpiry = draft.expiry.trim();
  if (draftExpiry !== initialExpiry) {
    patch.estimated_expiry = draftExpiry;
  }

  return patch;
}
