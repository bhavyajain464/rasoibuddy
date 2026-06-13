import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { QuantityBox, UnitPillSelector } from './UnitPillSelector';
import { UNIT_OPTIONS } from './UnitDropdown';
import {
  QTY_FIELD_MIN_WIDTH,
  compactUnitStripWidth,
  qtyUnitFlexWeights,
} from '../utils/ingredientUnits';

type Props = {
  qty: string;
  unit: string;
  onQtyChange: (qty: string) => void;
  onUnitChange: (unit: string) => void;
  allowedUnits?: readonly string[];
  style?: ViewStyle;
  /** When true, strip can grow within a flex parent (inline inventory row). */
  flexGrow?: boolean;
};

export function QtyUnitStrip({
  qty,
  unit,
  onQtyChange,
  onUnitChange,
  allowedUnits,
  style,
  flexGrow = false,
}: Props) {
  const unitCount = allowedUnits?.length ?? UNIT_OPTIONS.length;
  const weights = useMemo(() => qtyUnitFlexWeights(unitCount), [unitCount]);
  const unitMinWidth = compactUnitStripWidth(unitCount);

  return (
    <View style={[styles.strip, flexGrow && styles.stripFlexGrow, style]}>
      <View
        style={[
          styles.qtySlot,
          { flex: weights.qty, minWidth: QTY_FIELD_MIN_WIDTH },
        ]}
      >
        <QuantityBox
          label="Qty"
          value={qty}
          onChangeText={onQtyChange}
          compact
          fillWidth
          embedded
        />
      </View>
      <View
        style={[
          styles.unitSlot,
          { flex: weights.unit, minWidth: unitMinWidth },
        ]}
      >
        <UnitPillSelector
          value={unit}
          onChange={onUnitChange}
          allowedUnits={allowedUnits}
          compact
          fillWidth
          embedded
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 6,
    minWidth: 0,
  },
  stripFlexGrow: {
    flex: 1,
    flexShrink: 1,
  },
  qtySlot: {
    flexShrink: 1,
    minWidth: 0,
  },
  unitSlot: {
    flexShrink: 0,
    minWidth: 0,
  },
});
