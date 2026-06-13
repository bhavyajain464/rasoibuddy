import {
  ingredientInInventory,
  mealIngredientsMissingFromPantry,
} from './ingredientPantryMatch';

describe('mealIngredientsMissingFromPantry', () => {
  it('excludes ingredients already in inventory', () => {
    const meal = {
      ingredients: ['Moong sprouts', 'Onion', 'Tomato', 'Chaat masala'],
      items_to_order: [],
    };
    const missing = mealIngredientsMissingFromPantry(meal, ['Onion', 'Tomato']);
    expect(missing).toEqual(['Moong sprouts', 'Chaat masala']);
  });

  it('prefers items_to_order when provided', () => {
    const meal = {
      ingredients: ['Onion', 'Tomato', 'Potato'],
      items_to_order: ['Potato'],
    };
    const missing = mealIngredientsMissingFromPantry(meal, []);
    expect(missing).toEqual(['Potato']);
  });
});

describe('ingredientInInventory', () => {
  it('matches partial spice names', () => {
    expect(ingredientInInventory('Chilli powder', ['Chilli Powder'])).toBe(true);
  });
});
