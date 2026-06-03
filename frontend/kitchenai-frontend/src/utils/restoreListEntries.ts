/** Re-insert removed rows at their original indices (skips ids already present). */
export function restoreListEntries<T>(
  list: T[],
  entries: Array<{ item: T; index: number }>,
  getId: (item: T) => string,
): T[] {
  const next = [...list];
  const sorted = [...entries].sort((a, b) => a.index - b.index);
  for (const { item, index } of sorted) {
    if (next.some((row) => getId(row) === getId(item))) continue;
    next.splice(Math.min(index, next.length), 0, item);
  }
  return next;
}
