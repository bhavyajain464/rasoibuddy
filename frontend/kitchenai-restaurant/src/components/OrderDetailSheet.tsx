import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, Text } from 'react-native-paper';
import { restaurantFetch } from '../services/api';
import { Order, OrderIngredientUsed, OrderLine } from '../types';
import { palette } from '../theme';
import { showAppError, showAppSuccess } from '../utils/alertMessage';
import {
  aggregateIngredientsUsed,
  canProcessOrder,
  formatIngredientQty,
  formatWhen,
  isProcessed,
  itemsSummary,
  orderChipBase,
  orderDisplayId,
  sourceLabel,
  statusChipStyle,
  statusLabel,
} from '../utils/orderDisplay';
import { BottomSheet } from './BottomSheet';

type OrderDetailSheetProps = {
  visible: boolean;
  orderId: string | null;
  kitchenId: string;
  onClose: () => void;
  onOrderUpdated?: (order: Order) => void;
};

function LineRow({ line }: { line: OrderLine }) {
  return (
    <View style={styles.lineRow}>
      <Text style={styles.lineName}>{line.menu_item_name}</Text>
      <Text style={styles.lineMeta}>Qty {line.qty}</Text>
    </View>
  );
}

function IngredientRow({ ing }: { ing: OrderIngredientUsed }) {
  return (
    <View style={styles.ingRow}>
      <Text style={styles.ingName}>{ing.name}</Text>
      <Text style={styles.ingQty}>{formatIngredientQty(ing.qty, ing.unit)}</Text>
    </View>
  );
}

export default function OrderDetailSheet({
  visible,
  orderId,
  kitchenId,
  onClose,
  onOrderUpdated,
}: OrderDetailSheetProps) {
  const [detail, setDetail] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !orderId || !kitchenId) {
      setDetail(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);
    restaurantFetch<Order>(`/restaurant/${kitchenId}/orders/${orderId}`)
      .then((o) => {
        if (!cancelled) setDetail(o);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load order');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, orderId, kitchenId]);

  const handleProcess = async () => {
    if (!detail || !kitchenId || processing) return;
    setProcessing(true);
    try {
      const updated = await restaurantFetch<Order>(
        `/restaurant/${kitchenId}/orders/${detail.order_id}/process`,
        { method: 'POST', body: '{}' },
      );
      setDetail(updated);
      onOrderUpdated?.(updated);
      showAppSuccess('Order processed — stock deducted.');
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not process order');
    } finally {
      setProcessing(false);
    }
  };

  const sheetTitle = detail ? `Order #${orderDisplayId(detail)}` : 'Order details';
  const sheetSubtitle = detail
    ? `${sourceLabel(detail.source)} · ${formatWhen(detail.created_at)}`
    : undefined;
  const showProcess = detail != null && canProcessOrder(detail.status);
  const ingredientsUsed = detail ? aggregateIngredientsUsed(detail.ingredients_used ?? []) : [];

  return (
    <BottomSheet visible={visible} onDismiss={onClose} title={sheetTitle} subtitle={sheetSubtitle}>
      {loading ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : detail ? (
        <>
          <Chip compact style={[orderChipBase, statusChipStyle(detail.status), styles.chip]}>
            {statusLabel(detail.status)}
          </Chip>

          {(detail.status === 'in_process' || detail.status === 'open') && (
            <Text style={styles.hint}>
              {detail.status === 'in_process'
                ? 'Menu or stock may not be fully linked yet. Process when ready to deduct ingredients.'
                : 'Open order — process to deduct ingredients from stock.'}
            </Text>
          )}

          {showProcess ? (
            <Button
              mode="contained"
              icon="check-decagram"
              loading={processing}
              disabled={processing}
              onPress={handleProcess}
              style={styles.processBtn}
              buttonColor={palette.primary}
              textColor="#0F172A"
            >
              Process & deduct stock
            </Button>
          ) : null}

          <Divider style={styles.divider} />

          <Text variant="titleSmall" style={styles.sectionHeading}>
            Items ordered
          </Text>
          {(detail.lines ?? []).length === 0 ? (
            <Text style={styles.muted}>{itemsSummary(detail)}</Text>
          ) : (
            (detail.lines ?? []).map((line) => <LineRow key={line.line_id} line={line} />)
          )}

          {isProcessed(detail.status) && (
            <>
              <Divider style={styles.divider} />
              <Text variant="titleSmall" style={styles.sectionHeading}>
                Ingredients used
              </Text>
              {ingredientsUsed.length === 0 ? (
                <Text style={styles.muted}>No inventory deductions recorded for this order.</Text>
              ) : (
                ingredientsUsed.map((ing) => (
                  <IngredientRow key={`${ing.name}-${ing.unit}`} ing={ing} />
                ))
              )}
            </>
          )}
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: 32 },
  error: { color: palette.error, marginVertical: 16 },
  chip: { alignSelf: 'flex-start', marginBottom: 4 },
  hint: { color: palette.primary, fontSize: 13, marginTop: 10, lineHeight: 20 },
  processBtn: { marginTop: 12, borderRadius: 10 },
  divider: { marginVertical: 16, backgroundColor: palette.border },
  sectionHeading: { color: palette.text, marginBottom: 10 },
  lineRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  lineName: { color: palette.text, fontSize: 15 },
  lineMeta: { color: palette.textMuted, fontSize: 13, marginTop: 2 },
  ingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  ingName: { color: palette.text, flex: 1, paddingRight: 12 },
  ingQty: { color: palette.success, fontWeight: '600' },
  muted: { color: palette.textMuted },
});
