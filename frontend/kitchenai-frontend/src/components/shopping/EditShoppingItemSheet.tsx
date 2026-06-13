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
} from '../inventory/InventoryItemRowEditor';
import { CatalogIngredient, UserShoppingItem } from '../../types';
import { parseShoppingQtyInput } from '../../utils/shoppingFormat';
import { useIngredientCatalog } from '../../hooks/useIngredientCatalog';
import { resolveCatalogItem } from '../../utils/ingredientUnits';
import { palette } from '../../theme';

const EDIT_ROW_KEY = 'edit-row';

type Props = {
  visible: boolean;
  item: UserShoppingItem | null;
  onDismiss: () => void;
  onSave: (patch: { name: string; qty: number; unit: string }) => Promise<void>;
  saving?: boolean;
};

function itemToDraftRow(item: UserShoppingItem, catalog: CatalogIngredient[]): InventoryDraftRow {
  const match = resolveCatalogItem(catalog, undefined, item.name);
  return {
    key: EDIT_ROW_KEY,
    name: item.name,
    qty: String(item.qty),
    unit: item.unit || DEFAULT_UNIT,
    expiry: '',
    ingredientId: match?.ingredient_id,
  };
}

export function EditShoppingItemSheet({
  visible,
  item,
  onDismiss,
  onSave,
  saving = false,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const stackedRows = windowWidth < STACKED_ROW_BREAKPOINT;
  const { catalog } = useIngredientCatalog();
  const [draftRow, setDraftRow] = useState<InventoryDraftRow>({
    key: EDIT_ROW_KEY,
    name: '',
    qty: '',
    unit: DEFAULT_UNIT,
    expiry: '',
  });

  useEffect(() => {
    if (!item || !visible) return;
    setDraftRow(itemToDraftRow(item, catalog));
  }, [item, visible, catalog]);

  const canSave = useMemo(() => {
    const name = draftRow.name.trim();
    const qty = parseShoppingQtyInput(draftRow.qty);
    return name.length > 0 && qty > 0;
  }, [draftRow]);

  const handleSave = async () => {
    if (!item || !canSave) return;
    await onSave({
      name: draftRow.name.trim(),
      qty: parseShoppingQtyInput(draftRow.qty),
      unit: draftRow.unit || DEFAULT_UNIT,
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
        catalog={catalog}
        isLastRow
        isLastInList
        stacked={stackedRows}
        hideExpiry
        showRowActions={false}
        onUpdate={(patch) => {
          const { expiry: _expiry, foodGroup: _foodGroup, ...shoppingPatch } = patch;
          setDraftRow((prev) => ({ ...prev, ...shoppingPatch }));
        }}
      />
    </BottomSheet>
  );
}
