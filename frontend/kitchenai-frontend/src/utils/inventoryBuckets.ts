import type {
  ExpiringItem,
  InventoryBucket,
  InventoryBucketCounts,
  InventoryBucketsResponse,
  InventoryItem,
} from '../types';
import { daysUntilExpiryLocal } from './expiryDate';

/** Must match backend expiringSoonDays. */
export const EXPIRING_SOON_DAYS = 7;

function emptyCounts(): InventoryBucketCounts {
  return { active: 0, expiring: 0, expired: 0, total: 0 };
}

function computeCounts(data: {
  active?: InventoryItem[];
  expiring?: ExpiringItem[];
  expired?: ExpiringItem[];
  counts?: InventoryBucketCounts;
}): InventoryBucketCounts {
  if (data.counts && typeof data.counts.total === 'number') {
    return data.counts;
  }
  const active = data.active?.length ?? 0;
  const expiring = data.expiring?.length ?? 0;
  const expired = data.expired?.length ?? 0;
  return { active, expiring, expired, total: active + expiring + expired };
}

function withLocalDaysUntilExpiry(item: ExpiringItem): ExpiringItem {
  const days = daysUntilExpiryLocal(item.estimated_expiry);
  if (days === null) return item;
  return { ...item, days_until_expiry: days };
}

function mapExpiringBucket(items: ExpiringItem[] | undefined): ExpiringItem[] {
  return (items ?? []).map(withLocalDaysUntilExpiry);
}

/** Split legacy flat list into disjoint active, expiring, and expired buckets. */
export function splitLegacyInventoryItems(items: InventoryItem[]): {
  active: InventoryItem[];
  expiring: ExpiringItem[];
  expired: ExpiringItem[];
} {
  const active: InventoryItem[] = [];
  const expiring: ExpiringItem[] = [];
  const expired: ExpiringItem[] = [];

  for (const item of items) {
    const days = item.estimated_expiry
      ? daysUntilExpiryLocal(item.estimated_expiry)
      : null;

    if (days === null) {
      active.push(item);
      continue;
    }
    if (days < 0) {
      expired.push({
        item_id: item.item_id,
        canonical_name: item.canonical_name,
        qty: item.qty,
        unit: item.unit,
        food_group: item.food_group,
        estimated_expiry: item.estimated_expiry ?? '',
        days_until_expiry: days,
        updated_at: item.updated_at,
      });
      continue;
    }
    if (days <= EXPIRING_SOON_DAYS) {
      const expiry = item.estimated_expiry ?? '';
      expiring.push({
        item_id: item.item_id,
        canonical_name: item.canonical_name,
        qty: item.qty,
        unit: item.unit,
        food_group: item.food_group,
        estimated_expiry: expiry,
        days_until_expiry: days,
        updated_at: item.updated_at,
      });
    } else {
      active.push(item);
    }
  }

  return { active, expiring, expired };
}

/** Accept new bucket JSON or legacy flat array from older backends. */
export function normalizeInventoryBucketsResponse(
  raw: unknown,
  include: InventoryBucket[],
): InventoryBucketsResponse {
  if (Array.isArray(raw)) {
    const { active, expiring, expired } = splitLegacyInventoryItems(raw);
    const counts = {
      active: active.length,
      expiring: expiring.length,
      expired: expired.length,
      total: active.length + expiring.length + expired.length,
    };
    return {
      active: include.includes('active') ? active : undefined,
      expiring: include.includes('expiring') ? expiring : undefined,
      expired: include.includes('expired') ? expired : undefined,
      counts,
    };
  }

  if (raw && typeof raw === 'object') {
    const data = raw as InventoryBucketsResponse;
    const counts = computeCounts(data);
    return {
      active: include.includes('active') ? (data.active ?? []) : undefined,
      expiring: include.includes('expiring') ? mapExpiringBucket(data.expiring) : undefined,
      expired: include.includes('expired') ? mapExpiringBucket(data.expired) : undefined,
      counts,
    };
  }

  return { counts: emptyCounts() };
}
