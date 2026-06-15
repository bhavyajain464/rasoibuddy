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

  it('defaults lemon to 2 pcs when qty missing', () => {
    const lemon: CatalogIngredient = {
      ingredient_id: 'lemon',
      name: 'Lemon',
      default_unit: 'pcs',
      units: ['pcs'],
      food_group: 'fruits',
    };
    const line = normalizeSuggestedShoppingLine([lemon], {
      name: 'lemon',
      qty: 0,
      unit: 'pcs',
    });
    expect(line.name).toBe('Lemon');
    expect(line.unit).toBe('pcs');
    expect(line.qty).toBe(2);
  });
});
