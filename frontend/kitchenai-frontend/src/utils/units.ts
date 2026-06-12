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

function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Display string for quantity + unit (e.g. "2 kg", "1 pcs"). */
export function formatQtyWithUnit(qty: number, unit: string | undefined | null): string {
  const u = normalizeUnit(unit);
  return `${formatQty(qty)} ${u}`;
}
