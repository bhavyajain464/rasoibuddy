import type {
  ExpiringItem,
  InventoryBucket,
  InventoryBucketCounts,
  InventoryBucketsResponse,
} from '../types';

function emptyCounts(): InventoryBucketCounts {
  return { active: 0, expiring: 0, expired: 0, total: 0 };
}

function computeCounts(data: {
  counts?: InventoryBucketCounts;
}): InventoryBucketCounts {
  if (data.counts && typeof data.counts.total === 'number') {
    return data.counts;
  }
  return emptyCounts();
}

/** Map GET /inventory bucket JSON to the requested include slices. */
export function normalizeInventoryBucketsResponse(
  raw: unknown,
  include: InventoryBucket[],
): InventoryBucketsResponse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { counts: emptyCounts() };
  }

  const data = raw as InventoryBucketsResponse;
  const counts = computeCounts(data);
  return {
    active: include.includes('active') ? (data.active ?? []) : undefined,
    expiring: include.includes('expiring') ? (data.expiring ?? []) : undefined,
    expired: include.includes('expired') ? (data.expired ?? []) : undefined,
    counts,
  };
}

/** Prefer server-computed display_qty; fall back to raw qty + unit. */
export function pantryQtyLabel(item: {
  display_qty?: string;
  qty: number;
  unit: string;
}): string {
  const label = item.display_qty?.trim();
  if (label) return label;
  if (!item.qty || item.qty <= 0) return item.unit?.trim() || '';
  return `${item.qty} ${item.unit}`.trim();
}

/** Prefer server days_until_expiry for expiring/expired rows. */
export function expiryDaysLeft(item: {
  days_until_expiry?: number;
  estimated_expiry?: string;
}): number | null {
  if (typeof item.days_until_expiry === 'number') {
    return item.days_until_expiry;
  }
  return null;
}

export type { ExpiringItem };
