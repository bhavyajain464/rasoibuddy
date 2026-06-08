import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { InventoryRow } from '../../types';
import { palette } from '../../theme';
import { formatFoodGroupLabel, formatQty, normalizeFoodGroup } from '../../utils/foodGroup';

export const LOW_STOCK_THRESHOLD = 1;

type Props = {
  item: InventoryRow;
  style?: ViewStyle;
  showGroup?: boolean;
};

export function StockListItem({ item, style, showGroup = false }: Props) {
  const lowStock = item.qty <= LOW_STOCK_THRESHOLD;
  const groupLabel = formatFoodGroupLabel(item.food_group);

  return (
    <View style={[styles.card, lowStock && styles.cardLow, style]}>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
            {item.canonical_name}
          </Text>
          {showGroup ? <Text style={styles.group}>{groupLabel}</Text> : null}
        </View>
        <View style={styles.qtyBlock}>
          <Text style={[styles.qty, lowStock && styles.qtyLow]}>{formatQty(item.qty, item.unit)}</Text>
          {lowStock ? (
            <Text style={styles.lowBadge}>Low</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function isLowStock(item: InventoryRow): boolean {
  return item.qty <= LOW_STOCK_THRESHOLD;
}

export function stockGroupKey(item: InventoryRow): string {
  return normalizeFoodGroup(item.food_group);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardLow: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  main: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', color: palette.text },
  group: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  qtyBlock: { alignItems: 'flex-end' },
  qty: { color: palette.text, fontSize: 15, fontWeight: '700' },
  qtyLow: { color: palette.primary },
  lowBadge: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
