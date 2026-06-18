import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Button } from 'react-native-paper';
import { BottomSheet, bottomSheetPrimaryBtn } from '../BottomSheet';
import {
  InventoryItemRowEditor,
  inventoryRowListStyles,
  STACKED_ROW_BREAKPOINT,
  type InventoryDraftRow,
} from '../inventory/InventoryItemRowEditor';
import { DEFAULT_UNIT } from '../UnitPillSelector';
import { CatalogIngredient } from '../../types';
import { parseShoppingQtyInput } from '../../utils/shoppingFormat';
import { palette } from '../../theme';

export type StockAddRow = {
  name: string;
  qty: number;
  unit: string;
  food_group?: string;
};

type Props = {
  visible: boolean;
  catalog: CatalogIngredient[];
  onDismiss: () => void;
  onSave: (rows: StockAddRow[]) => Promise<void>;
};

let draftRowCounter = 0;

function newDraftRow(unit = DEFAULT_UNIT): InventoryDraftRow {
  draftRowCounter += 1;
  return { key: `row-${draftRowCounter}`, name: '', qty: '', unit };
}

function initialDraftRows(count = 1): InventoryDraftRow[] {
  return Array.from({ length: count }, () => newDraftRow());
}

function isRowAddable(row: InventoryDraftRow): boolean {
  const name = row.name.trim();
  const { qty } = parseShoppingQtyInput(row.qty, row.unit || DEFAULT_UNIT);
  return name.length > 0 && qty > 0;
}

export function AddStockSheet({ visible, catalog, onDismiss, onSave }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const stackedRows = windowWidth < STACKED_ROW_BREAKPOINT;
  const [draftRows, setDraftRows] = useState<InventoryDraftRow[]>(initialDraftRows);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraftRows(initialDraftRows());
  }, [visible]);

  const filledRows = useMemo(
    () =>
      draftRows
        .map((row) => {
          const parsed = parseShoppingQtyInput(row.qty, row.unit || DEFAULT_UNIT);
          return {
            name: row.name.trim(),
            qty: parsed.qty,
            unit: parsed.unit,
            food_group: row.foodGroup,
          };
        })
        .filter((row) => row.name.length > 0 && row.qty > 0),
    [draftRows],
  );

  const updateDraftRow = (key: string, patch: Partial<Omit<InventoryDraftRow, 'key'>>) => {
    setDraftRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    setDraftRows((prev) => {
      const last = prev[prev.length - 1];
      if (!last || !isRowAddable(last)) return prev;
      return [...prev, newDraftRow()];
    });
  };

  const removeDraftRow = (key: string) => {
    setDraftRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.key !== key);
    });
  };

  const handleDismiss = () => {
    if (saving) return;
    onDismiss();
  };

  const handleSubmit = async () => {
    if (!filledRows.length || saving) return;
    setSaving(true);
    try {
      await onSave(filledRows);
      onDismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={handleDismiss}
      dismissDisabled={saving}
      scrollable
      title="Add to stock"
      maxHeightRatio={0.92}
      footer={
        <Button
          mode="contained"
          onPress={() => void handleSubmit()}
          loading={saving}
          disabled={!filledRows.length || saving}
          buttonColor={palette.primary}
          textColor={palette.onPrimary}
          style={bottomSheetPrimaryBtn.button}
          contentStyle={bottomSheetPrimaryBtn.content}
          labelStyle={bottomSheetPrimaryBtn.label}
        >
          Add to stock
        </Button>
      }
    >
      <View style={inventoryRowListStyles.listDivider} />

      {draftRows.map((row, index) => (
        <InventoryItemRowEditor
          key={row.key}
          row={row}
          catalog={catalog}
          isLastRow={index === draftRows.length - 1}
          isLastInList={index === draftRows.length - 1}
          stacked={stackedRows}
          showRowActions
          autoFocusName={index === 0}
          canAdd={isRowAddable(row)}
          onUpdate={(patch) => updateDraftRow(row.key, patch)}
          onAddRow={addDraftRow}
          onRemoveRow={() => removeDraftRow(row.key)}
        />
      ))}
    </BottomSheet>
  );
}
