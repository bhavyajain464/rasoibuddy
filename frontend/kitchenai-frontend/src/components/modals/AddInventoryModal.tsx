import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from 'react-native-paper';
import * as api from '../../services/api';
import { DEFAULT_UNIT } from '../UnitPillSelector';
import {
  InventoryItemRowEditor,
  inventoryRowListStyles,
  STACKED_ROW_BREAKPOINT,
  type InventoryDraftRow,
} from '../inventory/InventoryItemRowEditor';
import { parseShoppingQtyInput } from '../../utils/shoppingFormat';
import { BottomSheet, bottomSheetPrimaryBtn } from '../BottomSheet';
import { showAppError, showAppSuccess } from '../../utils/alertMessage';
import { useAppRefresh } from '../../context/AppRefreshContext';
import { palette } from '../../theme';

let draftRowCounter = 0;

function newDraftRow(unit = DEFAULT_UNIT): InventoryDraftRow {
  draftRowCounter += 1;
  return { key: `row-${draftRowCounter}`, name: '', qty: '', unit, expiry: '' };
}

function initialDraftRows(count = 1): InventoryDraftRow[] {
  return Array.from({ length: count }, () => newDraftRow());
}

function isRowAddable(row: InventoryDraftRow): boolean {
  const name = row.name.trim();
  const qty = parseShoppingQtyInput(row.qty);
  return name.length > 0 && qty > 0;
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onAdded?: () => void;
};

export function AddInventoryModal({ visible, onDismiss, onAdded }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const stackedRows = windowWidth < STACKED_ROW_BREAKPOINT;
  const [draftRows, setDraftRows] = useState<InventoryDraftRow[]>(initialDraftRows);
  const [saving, setSaving] = useState(false);
  const { bump } = useAppRefresh();

  useEffect(() => {
    if (!visible) return;
    setDraftRows(initialDraftRows());
  }, [visible]);

  const filledRows = useMemo(
    () =>
      draftRows
        .map((row) => ({
          name: row.name.trim(),
          qty: parseShoppingQtyInput(row.qty),
          unit: row.unit || DEFAULT_UNIT,
          expiry: row.expiry.trim(),
        }))
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
      for (const row of filledRows) {
        await api.addInventoryItem({
          canonical_name: row.name,
          qty: row.qty,
          unit: row.unit,
          estimated_expiry: row.expiry || undefined,
        });
      }
      const count = filledRows.length;
      onDismiss();
      showAppSuccess(
        count === 1 ? 'Item added to inventory.' : `Added ${count} items to inventory.`,
      );
      bump('inventory');
    } catch {
      showAppError('Could not add items. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = 'Add to inventory';

  const sheetTitle = 'Add to inventory';

  return (
    <BottomSheet
      visible={visible}
      onDismiss={handleDismiss}
      dismissDisabled={saving}
      scrollable
      title={sheetTitle}
      maxHeightRatio={0.92}
      footer={(
        <Button
          mode="contained"
          onPress={() => void handleSubmit()}
          loading={saving}
          disabled={!filledRows.length || saving}
          buttonColor={palette.primary}
          style={bottomSheetPrimaryBtn.button}
          contentStyle={bottomSheetPrimaryBtn.content}
          labelStyle={bottomSheetPrimaryBtn.label}
        >
          {submitLabel}
        </Button>
      )}
    >
      <View style={inventoryRowListStyles.listDivider} />

      {draftRows.map((row, index) => (
        <InventoryItemRowEditor
          key={row.key}
          row={row}
          isLastRow={index === draftRows.length - 1}
          isLastInList={index === draftRows.length - 1}
          stacked={stackedRows}
          showRowActions
          canAdd={isRowAddable(row)}
          onUpdate={(patch) => updateDraftRow(row.key, patch)}
          onAddRow={addDraftRow}
          onRemoveRow={() => removeDraftRow(row.key)}
        />
      ))}
    </BottomSheet>
  );
}
