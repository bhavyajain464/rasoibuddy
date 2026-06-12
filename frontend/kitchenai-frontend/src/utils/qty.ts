/** Max quantity per pantry/shopping line — use kg/L for amounts above this. */
export const MAX_QTY = 999;

function cleanDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

/** Sanitize qty text input and cap at MAX_QTY while typing. */
export function sanitizeQtyInput(raw: string): string {
  const cleaned = cleanDecimalInput(raw);
  if (!cleaned || cleaned === '.') return cleaned;
  const n = parseFloat(cleaned);
  if (Number.isFinite(n) && n > MAX_QTY) {
    return String(MAX_QTY);
  }
  return cleaned;
}

export function parseQtyInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_QTY);
}
