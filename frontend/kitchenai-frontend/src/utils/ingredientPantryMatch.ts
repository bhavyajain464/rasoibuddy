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

export interface IngredientLine {
  ingredient_id: string;
  name: string;
}

export type PairIngredientsMap = Record<string, IngredientLine[] | string[]>;

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

export function ingredientInPantry(
  name: string,
  ingredientId: string | undefined,
  inventoryNames: string[],
  inventoryIds?: ReadonlySet<string>,
): boolean {
  const id = ingredientId?.trim();
  if (id && inventoryIds?.has(id)) return true;
  return ingredientInInventory(name, inventoryNames);
}

function pairIngredientLines(lines: PairIngredientsMap[string] | undefined): IngredientLine[] {
  if (!lines?.length) return [];
  if (typeof lines[0] === 'string') {
    return (lines as string[])
      .map((name) => ({ ingredient_id: '', name: name.trim() }))
      .filter((line) => line.name);
  }
  return (lines as IngredientLine[])
    .map((line) => ({
      ingredient_id: line.ingredient_id?.trim() ?? '',
      name: line.name?.trim() ?? '',
    }))
    .filter((line) => line.name);
}

/** Catalog-resolved grocery ingredients for one pairs_with label (from API pair_ingredients). */
export function ingredientsForPairLabel(
  pair: string,
  pairIngredients?: PairIngredientsMap,
): string[] {
  return pairIngredientLines(pairIngredients?.[pair.trim()]).map((line) => line.name);
}

export function ingredientLinesForPairLabel(
  pair: string,
  pairIngredients?: PairIngredientsMap,
): IngredientLine[] {
  return pairIngredientLines(pairIngredients?.[pair.trim()]);
}

export function ingredientsForSelectedPairs(
  selectedPairs: readonly string[],
  pairIngredients?: PairIngredientsMap,
): string[] {
  return selectedPairs.flatMap((pair) => ingredientsForPairLabel(pair, pairIngredients));
}

export function ingredientLinesForSelectedPairs(
  selectedPairs: readonly string[],
  pairIngredients?: PairIngredientsMap,
): IngredientLine[] {
  return selectedPairs.flatMap((pair) => ingredientLinesForPairLabel(pair, pairIngredients));
}

export function pairCoveredByPantry(
  pair: string,
  inventoryNames: string[],
  pairIngredients?: PairIngredientsMap,
  inventoryIds?: ReadonlySet<string>,
): boolean {
  const staples = ingredientLinesForPairLabel(pair, pairIngredients);
  if (!staples.length) return true;
  return staples.every((line) =>
    ingredientInPantry(line.name, line.ingredient_id || undefined, inventoryNames, inventoryIds),
  );
}

export function missingIngredientsFromPantry(
  ingredientLines: readonly string[],
  inventoryNames: string[],
  ingredientIds?: readonly string[],
  inventoryIds?: ReadonlySet<string>,
): string[] {
  return ingredientLines
    .map((s, idx) => ({
      name: s.trim(),
      ingredient_id: ingredientIds?.[idx]?.trim() || undefined,
    }))
    .filter((line) => line.name)
    .filter((line) => {
      const key = line.name.toLowerCase();
      if (COMMON_PANTRY_STAPLES.has(key)) return false;
      return !ingredientInPantry(line.name, line.ingredient_id, inventoryNames, inventoryIds);
    })
    .map((line) => line.name);
}

/** Missing recipe ingredients for the main dish (ingredients first, then items_to_order). */
export function mealIngredientsMissingFromPantry(
  meal: { items_to_order?: string[]; ingredients?: string[]; ingredient_ids?: string[] },
  inventoryNames: string[],
  inventoryIds?: ReadonlySet<string>,
): string[] {
  const fromIngredients = meal.ingredients?.map((s) => s.trim()).filter(Boolean) ?? [];
  const source = fromIngredients.length > 0
    ? fromIngredients
    : (meal.items_to_order?.map((s) => s.trim()).filter(Boolean) ?? []);
  const ids = fromIngredients.length > 0 ? meal.ingredient_ids : undefined;

  return missingIngredientsFromPantry(source, inventoryNames, ids, inventoryIds);
}

export function mergeIngredientLines(...groups: readonly string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const item = raw.trim();
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

/** Shopping lines for main dish + selected pairs (pair dishes → catalog ingredients). */
export function mealShopItemsMissing(
  meal: {
    ingredients?: string[];
    ingredient_ids?: string[];
    items_to_order?: string[];
    pair_ingredients?: PairIngredientsMap;
  },
  inventoryNames: string[],
  selectedPairs: readonly string[] = [],
  inventoryIds?: ReadonlySet<string>,
): string[] {
  const mealMissing = mealIngredientsMissingFromPantry(meal, inventoryNames, inventoryIds);
  const pairLines = ingredientLinesForSelectedPairs(selectedPairs, meal.pair_ingredients);
  const pairMissing = pairLines.length
    ? pairLines
        .filter((line) => {
          const key = line.name.toLowerCase();
          if (COMMON_PANTRY_STAPLES.has(key)) return false;
          return !ingredientInPantry(
            line.name,
            line.ingredient_id || undefined,
            inventoryNames,
            inventoryIds,
          );
        })
        .map((line) => line.name)
    : [];
  return mergeIngredientLines(mealMissing, pairMissing);
}
