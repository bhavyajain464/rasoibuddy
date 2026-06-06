import { StyleSheet } from 'react-native';
import { Order, OrderIngredientUsed } from '../types';
import { palette } from '../theme';

export function statusLabel(status: string): string {
  if (status === 'processed') return 'Processed';
  if (status === 'in_process') return 'In process';
  if (status === 'completed') return 'Completed';
  if (status === 'open') return 'Open';
  if (status === 'void') return 'Void';
  return status;
}

export function statusChipStyle(status: string) {
  if (status === 'processed' || status === 'completed') return orderChipStyles.processed;
  if (status === 'in_process' || status === 'open') return orderChipStyles.inProcess;
  if (status === 'void') return orderChipStyles.void;
  return undefined;
}

export function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const time = d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const date = d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
    });
    return `${time} · ${date}`;
  } catch {
    return iso;
  }
}

export function orderTimeMs(order: Order): number {
  const t = new Date(order.created_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function sortOrdersNewestFirst(list: Order[]): Order[] {
  return [...list].sort((a, b) => orderTimeMs(b) - orderTimeMs(a));
}

export function sourceLabel(source?: string): string {
  if (source === 'aggregator') return 'Zomato';
  if (source === 'pos') return 'POS';
  if (source === 'import') return 'Import';
  return source ?? '—';
}

export function orderDisplayId(order: Order): string {
  const ext = order.external_order_id?.trim();
  if (ext) return ext;
  return order.order_id.slice(0, 8);
}

export function itemsSummary(order: Order): string {
  if (order.items_summary?.trim()) return order.items_summary.trim();
  if (order.lines?.length) {
    return order.lines.map((l) => `${l.menu_item_name} × ${l.qty}`).join(' · ');
  }
  return 'Tap to view items';
}

export function formatIngredientQty(qty: number, unit: string): string {
  const n = Math.abs(qty);
  const text = n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
  return `${text} ${unit}`;
}

/** Merge duplicate ingredient rows (e.g. from retried deductions) by name + unit. */
export function aggregateIngredientsUsed(list: OrderIngredientUsed[]): OrderIngredientUsed[] {
  const byKey = new Map<string, OrderIngredientUsed>();
  for (const ing of list) {
    const key = `${ing.name.trim().toLowerCase()}\0${ing.unit.trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, { ...prev, qty: prev.qty + ing.qty });
    } else {
      byKey.set(key, { ...ing });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function isProcessed(status: string): boolean {
  return status === 'processed' || status === 'completed';
}

export function canProcessOrder(status: string): boolean {
  return status === 'in_process' || status === 'open';
}

const orderChipStyles = StyleSheet.create({
  processed: { backgroundColor: 'rgba(34, 197, 94, 0.25)' },
  inProcess: { backgroundColor: 'rgba(251, 191, 36, 0.25)' },
  void: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
});

export const orderChipBase = { backgroundColor: palette.surface };
