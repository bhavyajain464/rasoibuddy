import { parseQtyLine, type ParsedQtyLine } from './qty';

export function parseShoppingQtyInput(raw: string, unit: string): ParsedQtyLine {
  return parseQtyLine(raw, unit);
}
