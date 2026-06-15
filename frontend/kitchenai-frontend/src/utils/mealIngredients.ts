export const MAX_MAJOR_INGREDIENTS = 8;

export function majorIngredients(
  ingredients: readonly string[] | undefined | null,
  max = MAX_MAJOR_INGREDIENTS,
): string[] {
  return (ingredients ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function hiddenMajorIngredientCount(
  ingredients: readonly string[] | undefined | null,
  max = MAX_MAJOR_INGREDIENTS,
): number {
  const count = (ingredients ?? []).map((s) => s.trim()).filter(Boolean).length;
  return Math.max(0, count - max);
}
