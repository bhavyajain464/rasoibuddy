export const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'ml'] as const;

export const DEFAULT_UNIT = 'pcs';

const CANONICAL_UNITS = new Set<string>(UNIT_OPTIONS);

/** Map legacy / alias units to canonical ids used in the app and API. */
const UNIT_ALIASES: Record<string, string> = {
  piece: 'pcs',
  pieces: 'pcs',
  pc: 'pcs',
  nos: 'pcs',
  no: 'pcs',
  unit: 'pcs',
  units: 'pcs',
  pack: 'pcs',
  packs: 'pcs',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kgs: 'kg',
  liter: 'L',
  litre: 'L',
  litres: 'L',
  l: 'L',
  milliliter: 'ml',
  milliliters: 'ml',
  ml: 'ml',
  bunch: 'pcs',
  bunches: 'pcs',
  bundle: 'pcs',
  gucha: 'pcs',
  guchcha: 'pcs',
};

export function normalizeUnit(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return DEFAULT_UNIT;
  const key = trimmed.toLowerCase();
  const mapped = UNIT_ALIASES[key] ?? trimmed;
  if (CANONICAL_UNITS.has(mapped)) return mapped;
  if (CANONICAL_UNITS.has(mapped.toLowerCase())) {
    const lower = mapped.toLowerCase();
    return lower === 'l' ? 'L' : lower;
  }
  return mapped;
}

/** Promote g→kg and ml→L while qty exceeds MAX_QTY (imported at call site). */
export function compactQtyUnit(
  qty: number,
  unit: string,
  maxQty: number,
): { qty: number; unit: string } {
  let q = qty;
  let u = normalizeUnit(unit);
  if (!Number.isFinite(q) || q <= 0) {
    return { qty: 0, unit: u };
  }
  while (q > maxQty) {
    if (u === 'g') {
      q /= 1000;
      u = 'kg';
      continue;
    }
    if (u === 'ml') {
      q /= 1000;
      u = 'L';
      continue;
    }
    break;
  }
  return { qty: Math.round(q * 100) / 100, unit: u };
}

function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Display string for quantity + unit (e.g. "2 kg", "1 pcs"). */
export function formatQtyWithUnit(qty: number, unit: string | undefined | null): string {
  const compacted = compactQtyUnit(qty, unit ?? DEFAULT_UNIT, 999);
  const u = normalizeUnit(compacted.unit);
  return `${formatQty(compacted.qty)} ${u}`;
}
