import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Button } from 'react-native-paper';
import { BottomSheet, bottomSheetPrimaryBtn } from '../BottomSheet';
import { DEFAULT_UNIT } from '../UnitPillSelector';
import {
  InventoryItemRowEditor,
  inventoryRowListStyles,
  STACKED_ROW_BREAKPOINT,
  type InventoryDraftRow,
} from './InventoryItemRowEditor';
import { InventoryItem, ExpiringItem } from '../../types';
import { parseShoppingQtyInput } from '../../utils/shoppingFormat';
import { palette } from '../../theme';

type PantryItem = InventoryItem | ExpiringItem;

const EDIT_ROW_KEY = 'edit-row';

type Props = {
  visible: boolean;
  item: PantryItem | null;
  onDismiss: () => void;
  onSave: (patch: {
    canonical_name: string;
    qty: number;
    unit: string;
    estimated_expiry: string;
    is_manual: boolean;
  }) => Promise<void>;
  saving?: boolean;
};

function expiryToInput(expiry?: string): string {
  if (!expiry) return '';
  return expiry.slice(0, 10);
}

function itemToDraftRow(item: PantryItem): InventoryDraftRow {
  return {
    key: EDIT_ROW_KEY,
    name: item.canonical_name,
    qty: String(item.qty),
    unit: item.unit || DEFAULT_UNIT,
    expiry: expiryToInput(item.estimated_expiry),
  };
}

export function EditInventoryItemSheet({
  visible,
  item,
  onDismiss,
  onSave,
  saving = false,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const stackedRows = windowWidth < STACKED_ROW_BREAKPOINT;
  const [draftRow, setDraftRow] = useState<InventoryDraftRow>({
    key: EDIT_ROW_KEY,
    name: '',
    qty: '',
    unit: DEFAULT_UNIT,
    expiry: '',
  });

  useEffect(() => {
    if (!item || !visible) return;
    setDraftRow(itemToDraftRow(item));
  }, [item, visible]);

  const canSave = useMemo(() => {
    const name = draftRow.name.trim();
    const qty = parseShoppingQtyInput(draftRow.qty);
    return name.length > 0 && qty > 0;
  }, [draftRow]);

  const handleSave = async () => {
    if (!item || !canSave) return;
    const trimmedName = draftRow.name.trim();
    const parsedQty = parseShoppingQtyInput(draftRow.qty);
    await onSave({
      canonical_name: trimmedName,
      qty: parsedQty,
      unit: draftRow.unit || DEFAULT_UNIT,
      estimated_expiry: draftRow.expiry.trim(),
      is_manual: 'is_manual' in item ? item.is_manual : true,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      dismissDisabled={saving}
      scrollable
      title="Edit item"
      maxHeightRatio={0.92}
      footer={(
        <Button
          mode="contained"
          onPress={() => void handleSave()}
          loading={saving}
          disabled={saving || !canSave}
          buttonColor={palette.primary}
          style={bottomSheetPrimaryBtn.button}
          contentStyle={bottomSheetPrimaryBtn.content}
          labelStyle={bottomSheetPrimaryBtn.label}
        >
          Save changes
        </Button>
      )}
    >
      <View style={inventoryRowListStyles.listDivider} />

      <InventoryItemRowEditor
        row={draftRow}
        isLastRow
        isLastInList
        stacked={stackedRows}
        showRowActions={false}
        onUpdate={(patch) => setDraftRow((prev) => ({ ...prev, ...patch }))}
      />
    </BottomSheet>
  );
}
