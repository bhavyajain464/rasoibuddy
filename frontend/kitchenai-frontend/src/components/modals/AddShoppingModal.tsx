import React, { useEffect, useMemo, useState } from 'react';
import { coerceUnit, resolveCatalogItem, unitsForCatalogItem } from '../../utils/ingredientUnits';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Icon } from 'react-native-paper';
import * as api from '../../services/api';
import { IngredientNamePicker } from '../IngredientNamePicker';
import {
  DEFAULT_UNIT,
  ItemNameBox,
  QuantityBox,
  UnitPillSelector,
} from '../UnitPillSelector';
import { parseShoppingQtyInput } from '../../utils/shoppingFormat';
import { BottomSheet, bottomSheetPrimaryBtn } from '../BottomSheet';
import { showAppError, showAppSuccess } from '../../utils/alertMessage';
import { useAppRefresh } from '../../context/AppRefreshContext';
import { useIngredientCatalog } from '../../hooks/useIngredientCatalog';
import { palette } from '../../theme';

type DraftRow = {
  key: string;
  name: string;
  qty: string;
  unit: string;
  ingredientId?: string;
};

let draftRowCounter = 0;

function newDraftRow(unit = DEFAULT_UNIT): DraftRow {
  draftRowCounter += 1;
  return { key: `row-${draftRowCounter}`, name: '', qty: '', unit };
}

function initialDraftRows(count = 1): DraftRow[] {
  return Array.from({ length: count }, () => newDraftRow());
}

function isRowAddable(row: DraftRow): boolean {
  const name = row.name.trim();
  const qty = parseShoppingQtyInput(row.qty);
  return name.length > 0 && qty > 0;
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onAdded?: () => void;
};

export function AddShoppingModal({ visible, onDismiss, onAdded }: Props) {
  const [draftRows, setDraftRows] = useState<DraftRow[]>(initialDraftRows);
  const [saving, setSaving] = useState(false);
  const { bump } = useAppRefresh();
  const { catalog } = useIngredientCatalog();

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
        }))
        .filter((row) => row.name.length > 0 && row.qty > 0),
    [draftRows],
  );

  const updateDraftRow = (key: string, patch: Partial<Omit<DraftRow, 'key'>>) => {
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
      if (filledRows.length === 1) {
        await api.addShoppingItem(filledRows[0].name, filledRows[0].qty, filledRows[0].unit);
      } else {
        await api.addBulkShoppingItems(filledRows);
      }
      const count = filledRows.length;
      onDismiss();
      showAppSuccess(count === 1 ? 'Added to shopping list' : `Added ${count} items to your list`);
      bump('shopping');
    } catch {
      showAppError('Could not add items.');
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = 'Save to list';

  const sheetTitle = 'Add to list';

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
      <View style={styles.listDivider} />

      {draftRows.map((row, index) => {
        const isLastRow = index === draftRows.length - 1;
        const canAdd = isRowAddable(row);
        const catalogItem = resolveCatalogItem(catalog, row.ingredientId, row.name);
        const allowedUnits = unitsForCatalogItem(catalogItem);

        return (
          <View key={row.key} style={styles.draftRow}>
            {catalog.length > 0 ? (
              <IngredientNamePicker
                catalog={catalog}
                value={row.name}
                ingredientId={row.ingredientId}
                onChangeText={(name) => updateDraftRow(row.key, { name, ingredientId: undefined })}
                onSelect={(pick) =>
                  updateDraftRow(row.key, {
                    name: pick.ingredient_name,
                    unit: pick.unit,
                    ingredientId: pick.ingredient_id,
                  })
                }
                label="Name"
                placeholder="Search ingredients…"
                compact
                style={styles.nameField}
              />
            ) : (
              <ItemNameBox
                label="Name"
                value={row.name}
                onChangeText={(name) => updateDraftRow(row.key, { name })}
                placeholder="Item name"
                compact
                style={styles.nameField}
              />
            )}

            <View style={styles.qtyUnitStrip}>
              <QuantityBox
                label="Qty"
                value={row.qty}
                onChangeText={(qty) => updateDraftRow(row.key, { qty })}
                compact
                embedded
              />

              <UnitPillSelector
                value={coerceUnit(row.unit, allowedUnits)}
                onChange={(unit) => updateDraftRow(row.key, { unit })}
                allowedUnits={allowedUnits}
                compact
                hugContent
                embedded
              />
            </View>

            {isLastRow ? (
              <Pressable
                onPress={addDraftRow}
                disabled={!canAdd}
                style={({ pressed }) => [
                  styles.rowActionBtn,
                  !canAdd && styles.rowActionBtnDisabled,
                  pressed && canAdd && styles.rowActionBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add another row"
                accessibilityState={{ disabled: !canAdd }}
              >
                <Icon
                  source="plus"
                  size={20}
                  color={canAdd ? palette.primary : palette.textMuted}
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => removeDraftRow(row.key)}
                style={({ pressed }) => [
                  styles.rowActionBtn,
                  styles.rowActionBtnRemove,
                  pressed && styles.rowActionBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Remove row"
              >
                <Icon source="minus" size={20} color={palette.textSecondary} />
              </Pressable>
            )}
          </View>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginBottom: 12,
    marginTop: -4,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 10,
    paddingTop: 4,
  },
  nameField: {
    flex: 1,
    minWidth: 0,
  },
  qtyUnitStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    flexGrow: 0,
    flexShrink: 0,
    paddingTop: 6,
  },
  rowActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: palette.primary,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    flexShrink: 0,
  },
  rowActionBtnRemove: {
    borderColor: palette.border,
  },
  rowActionBtnDisabled: {
    borderColor: palette.borderLight,
    backgroundColor: '#FAFAFA',
  },
  rowActionBtnPressed: {
    opacity: 0.75,
  },
});
