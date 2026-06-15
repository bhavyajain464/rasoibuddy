import type { CatalogDishSearchItem } from '../data/dishCatalogSearch';

export const MAX_DISH_SEARCH_RESULTS = 120;
export const DISH_ROW_MIN_HEIGHT = 56;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function dishMatchesQuery(item: CatalogDishSearchItem, q: string): boolean {
  const name = norm(item.name);
  const id = norm(item.id);
  const cuisine = norm(item.cuisine);
  return name.includes(q) || id.includes(q) || cuisine.includes(q);
}

function dishesForSlot(catalog: CatalogDishSearchItem[], mealSlot: string): CatalogDishSearchItem[] {
  const slot = norm(mealSlot);
  const matches = catalog.filter((d) => d.mealTypes.some((t) => norm(t) === slot));
  return matches.length ? matches : catalog;
}

export function filterDishCatalog(
  catalog: CatalogDishSearchItem[],
  query: string,
  mealSlot?: string,
  limit = MAX_DISH_SEARCH_RESULTS,
): CatalogDishSearchItem[] {
  const q = norm(query);
  const pool = mealSlot ? dishesForSlot(catalog, mealSlot) : catalog;

  if (!q) {
    return pool.slice(0, limit);
  }

  const matches: CatalogDishSearchItem[] = [];
  for (const item of pool) {
    if (matches.length >= limit) break;
    if (dishMatchesQuery(item, q)) {
      matches.push(item);
    }
  }

  if (matches.length > 0 || pool === catalog) {
    return matches;
  }

  for (const item of catalog) {
    if (matches.length >= limit) break;
    if (dishMatchesQuery(item, q)) {
      matches.push(item);
    }
  }
  return matches;
}
