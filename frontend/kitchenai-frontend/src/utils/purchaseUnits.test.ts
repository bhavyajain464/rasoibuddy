import type { CatalogIngredient } from '../types';
import {
  defaultPurchaseQty,
  formatPurchaseQty,
  isCountPurchased,
} from './purchaseUnits';

const lemon: CatalogIngredient = {
  ingredient_id: 'lemon',
  name: 'Lemon',
  default_unit: 'pcs',
  units: ['pcs'],
  food_group: 'fruits',
};

const egg: CatalogIngredient = {
  ingredient_id: 'egg',
  name: 'Egg',
  default_unit: 'pcs',
  units: ['pcs'],
  food_group: 'dairy',
};

const rice: CatalogIngredient = {
  ingredient_id: 'basmati_rice',
  name: 'Basmati Rice',
  default_unit: 'kg',
  units: ['kg', 'g'],
  food_group: 'grains_pulses',
};

describe('purchaseUnits', () => {
  it('defaults lemon to 2', () => {
    expect(defaultPurchaseQty(lemon, 'pcs')).toBe(2);
  });

  it('defaults eggs to 6', () => {
    expect(defaultPurchaseQty(egg, 'pcs')).toBe(6);
  });

  it('formats lemon without pcs label', () => {
    expect(formatPurchaseQty(2, 'pcs', lemon)).toBe('2');
    expect(isCountPurchased(lemon, 'pcs')).toBe(true);
  });

  it('formats weight items with unit', () => {
    expect(formatPurchaseQty(1, 'kg', rice)).toBe('1 kg');
    expect(isCountPurchased(rice, 'kg')).toBe(false);
  });
});
