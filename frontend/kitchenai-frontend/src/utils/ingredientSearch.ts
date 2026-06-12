import type { CatalogIngredient } from '../types';

export const MAX_INLINE_OPTIONS = 24;
export const MAX_FULLSCREEN_OPTIONS = 120;
export const OPTION_MIN_HEIGHT = 48;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function filterCatalog(
  catalog: CatalogIngredient[],
  query: string,
  limit = MAX_INLINE_OPTIONS,
): CatalogIngredient[] {
  const q = norm(query);
  if (!q) return catalog.slice(0, limit);
  const matches: CatalogIngredient[] = [];
  for (const item of catalog) {
    if (matches.length >= limit) break;
    const name = norm(item.name);
    const id = norm(item.ingredient_id);
    if (name.includes(q) || id.includes(q)) {
      matches.push(item);
      continue;
    }
    if (item.synonyms?.some((syn) => norm(syn).includes(q))) {
      matches.push(item);
    }
  }
  return matches;
}
