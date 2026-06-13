/** Staples assumed on hand — not worth adding to a shopping list. Mirrors backend commonPantryStaples. */
const COMMON_PANTRY_STAPLES = new Set([
  'salt',
  'water',
  'cooking oil',
  'oil',
  'sugar',
  'turmeric powder',
  'red chilli powder',
  'coriander powder',
  'cumin powder',
  'garam masala',
  'mustard seeds',
  'cumin seeds',
  'asafoetida',
  'black pepper',
  'ghee',
]);

export function ingredientsMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function ingredientInInventory(ingredient: string, inventoryNames: string[]): boolean {
  const ing = ingredient.trim().toLowerCase();
  if (!ing) return false;
  return inventoryNames.some((name) => ingredientsMatch(ingredient, name));
}

/** Ingredients from a meal that are not already in the pantry. */
export function mealIngredientsMissingFromPantry(
  meal: { items_to_order?: string[]; ingredients?: string[] },
  inventoryNames: string[],
): string[] {
  const fromOrder = meal.items_to_order?.map((s) => s.trim()).filter(Boolean) ?? [];
  const source = fromOrder.length > 0
    ? fromOrder
    : (meal.ingredients?.map((s) => s.trim()).filter(Boolean) ?? []);

  return source.filter((name) => {
    const key = name.toLowerCase();
    if (COMMON_PANTRY_STAPLES.has(key)) return false;
    return !ingredientInInventory(name, inventoryNames);
  });
}
