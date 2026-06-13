import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Surface, Text } from 'react-native-paper';
import { Order } from '../types';
import { palette } from '../theme';
import {
  formatWhen,
  itemsSummary,
  orderDisplayId,
  sortOrdersNewestFirst,
  statusLabel,
} from '../utils/orderDisplay';

const PREVIEW_LIMIT = 5;

type Props = {
  orders: Order[];
  expanded: boolean;
  onToggle: () => void;
  onOrderPress: (orderId: string) => void;
  onViewAll: () => void;
};

export function PendingOrdersPanel({ orders, expanded, onToggle, onOrderPress, onViewAll }: Props) {
  const pending = sortOrdersNewestFirst(orders);
  const preview = pending.slice(0, PREVIEW_LIMIT);
  const count = pending.length;
  const allCaughtUp = count === 0;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={allCaughtUp ? onViewAll : onToggle}
        style={({ pressed }) => [
          styles.header,
          allCaughtUp ? styles.headerSuccess : styles.headerPending,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: allCaughtUp ? undefined : expanded }}
        accessibilityLabel={
          allCaughtUp
            ? 'All orders processed. Open Orders.'
            : `${count} orders pending processing. ${expanded ? 'Collapse' : 'Expand'} list`
        }
      >
        <Icon
          source={allCaughtUp ? 'check-circle-outline' : 'alert-circle-outline'}
          size={22}
          color={allCaughtUp ? palette.success : palette.primary}
        />
        <View style={styles.headerText}>
          <Text variant="titleSmall" style={styles.headerTitle}>
            {allCaughtUp
              ? 'All caught up'
              : `${count} order${count !== 1 ? 's' : ''} pending processing`}
          </Text>
          <Text variant="bodySmall" style={styles.headerSub}>
            {allCaughtUp
              ? 'No orders waiting — stock deductions are up to date'
              : expanded
                ? 'Tap to collapse'
                : 'Menu or stock not fully linked — tap to expand'}
          </Text>
        </View>
        {!allCaughtUp ? (
          <Icon source={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={palette.primary} />
        ) : (
          <Icon source="chevron-right" size={22} color={palette.success} />
        )}
      </Pressable>

      {!allCaughtUp && expanded ? (
        <Surface style={styles.panel} elevation={0}>
          {preview.length === 0 ? (
            <Text style={styles.emptyLine}>No orders pending processing</Text>
          ) : (
            preview.map((order, index) => (
              <Pressable
                key={order.order_id}
                onPress={() => onOrderPress(order.order_id)}
                style={({ pressed }) => [
                  styles.orderRow,
                  index < preview.length - 1 && styles.orderRowBorder,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.orderMain}>
                  <Text style={styles.orderId}>#{orderDisplayId(order)}</Text>
                  <Text style={styles.orderItems} numberOfLines={1}>
                    {itemsSummary(order)}
                  </Text>
                  <Text style={styles.orderWhen}>{formatWhen(order.created_at)}</Text>
                </View>
                <Text style={styles.orderStatus}>{statusLabel(order.status)}</Text>
              </Pressable>
            ))
          )}
          {count > PREVIEW_LIMIT ? (
            <Pressable onPress={onViewAll} style={styles.viewAllRow}>
              <Text style={styles.viewAllText}>View all {count} in Orders</Text>
            </Pressable>
          ) : count > 0 ? (
            <Pressable onPress={onViewAll} style={styles.viewAllRow}>
              <Text style={styles.viewAllText}>Open Orders</Text>
            </Pressable>
          ) : null}
        </Surface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  headerPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  headerSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  headerText: { flex: 1 },
  headerTitle: { color: palette.text, fontWeight: '700' },
  headerSub: { color: palette.textMuted, marginTop: 2 },
  panel: {
    marginTop: 8,
    backgroundColor: palette.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  emptyLine: {
    color: palette.textMuted,
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  orderRowBorder: { borderBottomWidth: 1, borderBottomColor: palette.border },
  orderMain: { flex: 1, minWidth: 0 },
  orderId: { color: palette.text, fontWeight: '700', fontSize: 15 },
  orderItems: { color: palette.textMuted, fontSize: 13, marginTop: 2 },
  orderWhen: { color: palette.textMuted, fontSize: 11, marginTop: 4 },
  orderStatus: { color: palette.primary, fontSize: 12, fontWeight: '600' },
  viewAllRow: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: palette.border },
  viewAllText: { color: palette.primary, fontWeight: '600', fontSize: 13 },
  pressed: { opacity: 0.88 },
});
