import type { CatalogIngredient } from '../types';
import { DEFAULT_UNIT, UNIT_OPTIONS, normalizeUnit } from './units';

export function resolveCatalogItem(
  catalog: CatalogIngredient[],
  ingredientId?: string,
  name?: string,
): CatalogIngredient | undefined {
  if (ingredientId) {
    const byId = catalog.find((c) => c.ingredient_id === ingredientId);
    if (byId) return byId;
  }
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return undefined;
  return catalog.find((c) => c.name.trim().toLowerCase() === n);
}

/** Units allowed for this catalog row; falls back to all units when unknown. */
export function unitsForCatalogItem(item?: CatalogIngredient | null): string[] {
  if (!item) return [...UNIT_OPTIONS];
  const raw = item.units?.length ? item.units : [item.default_unit];
  const canonical = new Set<string>(UNIT_OPTIONS);
  const normalized = raw.map((u) => normalizeUnit(u)).filter((u) => canonical.has(u));
  const unique = [...new Set(normalized)];
  return unique.length ? unique : [...UNIT_OPTIONS];
}

export function defaultUnitForCatalogItem(item: CatalogIngredient): string {
  const allowed = unitsForCatalogItem(item);
  const preferred = normalizeUnit(item.default_unit);
  if (allowed.includes(preferred)) return preferred;
  return allowed[0] ?? DEFAULT_UNIT;
}

export function coerceUnit(unit: string, allowed: readonly string[]): string {
  const normalized = normalizeUnit(unit);
  if (allowed.includes(normalized)) return normalized;
  return allowed[0] ?? DEFAULT_UNIT;
}

/** Width for compact unit pill strip given number of visible units. */
export function compactUnitStripWidth(unitCount: number): number {
  const COMPACT_SEGMENT_MIN_WIDTH = 32;
  const n = Math.max(1, unitCount);
  return n * COMPACT_SEGMENT_MIN_WIDTH + (n - 1) + 8;
}
