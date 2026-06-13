import type { CatalogIngredient } from '../types';
import { resolveCatalogItem, unitsForCatalogItem, normalizeSuggestedShoppingLine } from './ingredientUnits';

const greenCardamom: CatalogIngredient = {
  ingredient_id: 'cardamom_green',
  name: 'Green Cardamom',
  default_unit: 'g',
  units: ['g', 'kg'],
  synonyms: ['cardamom', 'elaichi'],
};

describe('resolveCatalogItem', () => {
  const catalog = [greenCardamom];

  it('matches canonical name', () => {
    expect(resolveCatalogItem(catalog, undefined, 'Green Cardamom')?.ingredient_id).toBe('cardamom_green');
  });

  it('matches synonym cardamom', () => {
    expect(resolveCatalogItem(catalog, undefined, 'cardamom')?.ingredient_id).toBe('cardamom_green');
  });

  it('limits units for synonym match', () => {
    const item = resolveCatalogItem(catalog, undefined, 'cardamom');
    expect(unitsForCatalogItem(item)).toEqual(['g', 'kg']);
  });

  it('normalizes suggested shopping lines', () => {
    const line = normalizeSuggestedShoppingLine(catalog, {
      name: 'cardamom',
      qty: 0,
      unit: 'pcs',
    });
    expect(line.name).toBe('Green Cardamom');
    expect(line.unit).toBe('g');
    expect(line.qty).toBe(250);
  });
});
