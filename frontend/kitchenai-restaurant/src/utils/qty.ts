import { compactQtyUnit, normalizeUnit } from './units';

/** Max quantity per pantry/shopping line — use kg/L for amounts above this. */
export const MAX_QTY = 999;

function cleanDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

function formatQtyNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Sanitize qty text input; caps at MAX_QTY or promotes to a larger unit when possible. */
export function sanitizeQtyInput(raw: string, unit?: string): string {
  const cleaned = cleanDecimalInput(raw);
  if (!cleaned || cleaned === '.') return cleaned;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  if (n > MAX_QTY && unit) {
    const compacted = compactQtyUnit(n, unit, MAX_QTY);
    if (compacted.qty <= MAX_QTY && compacted.unit !== normalizeUnit(unit)) {
      return formatQtyNumber(compacted.qty);
    }
  }
  if (n > MAX_QTY) {
    return String(MAX_QTY);
  }
  return cleaned;
}

export function parseQtyInput(raw: string, unit?: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (unit) {
    const compacted = compactQtyUnit(n, unit, MAX_QTY);
    return Math.min(compacted.qty, MAX_QTY);
  }
  return Math.min(n, MAX_QTY);
}

export type ParsedQtyLine = { qty: number; unit: string };

/** Parse qty text, compact to a larger unit when needed, and enforce MAX_QTY. */
export function parseQtyLine(raw: string, unit: string): ParsedQtyLine {
  const trimmed = raw.trim();
  if (!trimmed) return { qty: 0, unit: normalizeUnit(unit) };
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return { qty: 0, unit: normalizeUnit(unit) };
  const compacted = compactQtyUnit(n, unit, MAX_QTY);
  if (compacted.qty > MAX_QTY) {
    return { qty: MAX_QTY, unit: compacted.unit };
  }
  return compacted;
}

/** When qty exceeds MAX_QTY, return compacted qty/unit if a larger unit applies. */
export function normalizeQtyOnInput(
  raw: string,
  unit: string,
): { qty: string; unit: string } | null {
  const cleaned = cleanDecimalInput(raw);
  if (!cleaned || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= MAX_QTY) return null;
  const compacted = compactQtyUnit(n, unit, MAX_QTY);
  if (compacted.unit === normalizeUnit(unit)) return null;
  return { qty: formatQtyNumber(compacted.qty), unit: compacted.unit };
}
