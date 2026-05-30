import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Icon, Text } from 'react-native-paper';
import * as api from '../../services/api';
import { ExpiryDateBox } from '../ExpiryDateBox';
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
import { palette } from '../../theme';

type DraftRow = {
  key: string;
  name: string;
  qty: string;
  unit: string;
  expiry: string;
};

let draftRowCounter = 0;

function newDraftRow(unit = DEFAULT_UNIT): DraftRow {
  draftRowCounter += 1;
  return { key: `row-${draftRowCounter}`, name: '', qty: '', unit, expiry: '' };
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

/** Below this width: two-line row (identity row + measurement row). */
const STACKED_ROW_BREAKPOINT = 560;

const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;

const ACTION_SIZE = 40;
const ACTION_COLUMN = ACTION_SIZE + SP.sm;
const INDEX_COLUMN = 22;
/** Fits DD/MM/YYYY + calendar icon + "Expiry (optional)" label */
const EXPIRY_COLUMN = 136;

type RowActionProps = {
  isLastRow: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: () => void;
};

function RowActionButton({ isLastRow, canAdd, onAdd, onRemove }: RowActionProps) {
  if (isLastRow) {
    return (
      <Pressable
        onPress={onAdd}
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
    );
  }

  return (
    <Pressable
      onPress={onRemove}
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
  );
}

type DraftRowEditorProps = {
  row: DraftRow;
  index: number;
  isLastRow: boolean;
  isLastInList: boolean;
  stacked: boolean;
  canAdd: boolean;
  onUpdate: (patch: Partial<Omit<DraftRow, 'key'>>) => void;
  onAddRow: () => void;
  onRemoveRow: () => void;
};

function DraftRowEditor({
  row,
  index,
  isLastRow,
  isLastInList,
  stacked,
  canAdd,
  onUpdate,
  onAddRow,
  onRemoveRow,
}: DraftRowEditorProps) {
  const action = (
    <RowActionButton
      isLastRow={isLastRow}
      canAdd={canAdd}
      onAdd={onAddRow}
      onRemove={onRemoveRow}
    />
  );

  if (stacked) {
    return (
      <View style={[styles.entryCard, isLastInList && styles.entryCardLast]}>
        <View style={styles.stackedRow}>
          <View style={styles.indexColumn}>
            <Text variant="labelSmall" style={styles.rowIndex}>
              {index + 1}
            </Text>
          </View>

          <View style={styles.stackedMain}>
            <View style={[styles.stackedFields, { paddingRight: ACTION_COLUMN }]}>
              <View style={styles.identityRow}>
                <ItemNameBox
                  label="Name"
                  value={row.name}
                  onChangeText={(name) => onUpdate({ name })}
                  placeholder="Item name"
                  compact
                  style={styles.nameField}
                />
                <View style={styles.expirySlot}>
                  <ExpiryDateBox
                    value={row.expiry}
                    onChange={(expiry) => onUpdate({ expiry })}
                    compact
                  />
                </View>
              </View>

              <View style={styles.measurementRow}>
                <QuantityBox
                  label="Qty"
                  value={row.qty}
                  onChangeText={(qty) => onUpdate({ qty })}
                  compact
                  embedded
                />
                <View style={styles.unitSlot}>
                  <UnitPillSelector
                    value={row.unit}
                    onChange={(unit) => onUpdate({ unit })}
                    compact
                    fillWidth
                    embedded
                  />
                </View>
              </View>
            </View>

            <View style={styles.stackedActionColumn} pointerEvents="box-none">
              {action}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.entryCard, isLastInList && styles.entryCardLast]}>
      <View style={styles.inlineRow}>
        <View style={styles.inlineIndexCell}>
          <Text variant="labelSmall" style={styles.rowIndexInline}>
            {index + 1}
          </Text>
        </View>

        <View style={styles.inlineNameSlot}>
          <ItemNameBox
            label="Name"
            value={row.name}
            onChangeText={(name) => onUpdate({ name })}
            placeholder="Item name"
            compact
            style={styles.nameField}
          />
        </View>

        <View style={styles.inlineQtyUnitStrip}>
          <QuantityBox
            label="Qty"
            value={row.qty}
            onChangeText={(qty) => onUpdate({ qty })}
            compact
            embedded
          />
          <View style={styles.inlineUnitSlot}>
            <UnitPillSelector
              value={row.unit}
              onChange={(unit) => onUpdate({ unit })}
              compact
              hugContent
              embedded
            />
          </View>
        </View>

        <View style={styles.inlineExpirySlot}>
          <ExpiryDateBox
            value={row.expiry}
            onChange={(expiry) => onUpdate({ expiry })}
            compact
            style={styles.expiryFieldInline}
          />
        </View>

        <View style={styles.inlineActionCell}>{action}</View>
      </View>
    </View>
  );
}

export function AddInventoryModal({ visible, onDismiss, onAdded }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const stackedRows = windowWidth < STACKED_ROW_BREAKPOINT;
  const [draftRows, setDraftRows] = useState<DraftRow[]>(initialDraftRows);
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
      bump();
      onAdded?.();
    } catch {
      showAppError('Could not add items. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const submitLabel = !filledRows.length
    ? 'Add to inventory'
    : filledRows.length === 1
      ? 'Add to inventory'
      : `Add ${filledRows.length} items to inventory`;

  const sheetTitle = draftRows.length === 1
    ? 'Add to inventory'
    : `Add to inventory (${draftRows.length})`;

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

      {draftRows.map((row, index) => (
        <DraftRowEditor
          key={row.key}
          row={row}
          index={index}
          isLastRow={index === draftRows.length - 1}
          isLastInList={index === draftRows.length - 1}
          stacked={stackedRows}
          canAdd={isRowAddable(row)}
          onUpdate={(patch) => updateDraftRow(row.key, patch)}
          onAddRow={addDraftRow}
          onRemoveRow={() => removeDraftRow(row.key)}
        />
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginBottom: SP.md,
  },
  entryCard: {
    marginBottom: SP.md,
    paddingBottom: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderLight,
  },
  entryCardLast: {
    marginBottom: SP.sm,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  /** Stacked (narrow): index | two-line field block + centered action */
  stackedRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SP.sm,
  },
  indexColumn: {
    width: INDEX_COLUMN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowIndex: {
    color: palette.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  stackedMain: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  stackedFields: {
    gap: SP.sm,
    minWidth: 0,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SP.sm,
  },
  expirySlot: {
    width: EXPIRY_COLUMN,
    flexShrink: 0,
  },
  measurementRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SP.sm,
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 6,
  },
  unitSlot: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  stackedActionColumn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_COLUMN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Inline (wide): shared label offset so + aligns with input boxes */
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SP.sm,
    width: '100%',
  },
  inlineIndexCell: {
    width: INDEX_COLUMN,
    paddingTop: 6,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
  },
  rowIndexInline: {
    color: palette.textMuted,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 40,
  },
  inlineNameSlot: {
    flex: 1,
    flexShrink: 1,
    minWidth: 88,
  },
  inlineQtyUnitStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SP.sm,
    flexGrow: 0,
    flexShrink: 0,
    paddingTop: 6,
  },
  inlineUnitSlot: {
    flexGrow: 0,
    flexShrink: 0,
  },
  inlineExpirySlot: {
    width: EXPIRY_COLUMN,
    flexShrink: 0,
  },
  expiryFieldInline: {
    width: '100%',
    marginBottom: 0,
  },
  nameField: {
    flex: 1,
    minWidth: 0,
  },
  inlineActionCell: {
    paddingTop: 6,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
  },
  rowActionBtn: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    borderWidth: 1.5,
    borderColor: palette.primary,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
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
