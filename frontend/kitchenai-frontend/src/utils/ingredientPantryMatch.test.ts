import {
  ingredientInInventory,
  ingredientsForPairLabel,
  mealIngredientsMissingFromPantry,
  mealShopItemsMissing,
  missingIngredientsFromPantry,
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

  it('prefers ingredients over items_to_order', () => {
    const meal = {
      ingredients: ['Onion', 'Tomato', 'Potato'],
      items_to_order: ['Potato'],
    };
    const missing = mealIngredientsMissingFromPantry(meal, []);
    expect(missing).toEqual(['Onion', 'Tomato', 'Potato']);
  });

  it('falls back to items_to_order when ingredients empty', () => {
    const meal = {
      ingredients: [],
      items_to_order: ['Potato'],
    };
    const missing = mealIngredientsMissingFromPantry(meal, []);
    expect(missing).toEqual(['Potato']);
  });
});

describe('ingredientsForPairLabel', () => {
  it('returns catalog ingredients for a pair label', () => {
    expect(
      ingredientsForPairLabel('roti / chapati', {
        'roti / chapati': ['Whole wheat flour', 'Water'],
      }),
    ).toEqual(['Whole wheat flour', 'Water']);
  });

  it('does not treat an unresolved pair label as a grocery item', () => {
    expect(ingredientsForPairLabel('jeera rice', {})).toEqual([]);
  });
});

describe('mealShopItemsMissing', () => {
  it('includes missing ingredients from selected pair dishes', () => {
    const meal = {
      ingredients: ['paneer', 'tomato'],
      pair_ingredients: {
        'jeera rice': [
          { ingredient_id: 'basmati_rice', name: 'rice' },
          { ingredient_id: 'cumin_seeds', name: 'cumin seeds' },
          { ingredient_id: 'ghee', name: 'ghee' },
        ],
      },
    };
    const missing = mealShopItemsMissing(meal, ['paneer'], ['jeera rice']);
    expect(missing).toEqual(['tomato', 'rice', 'cumin seeds']);
  });

  it('matches pantry by ingredient_id when available', () => {
    const meal = {
      ingredients: ['Onion', 'Tomato'],
      ingredient_ids: ['onion', 'tomato'],
    };
    const inventoryIds = new Set(['onion']);
    const missing = mealIngredientsMissingFromPantry(meal, [], inventoryIds);
    expect(missing).toEqual(['Tomato']);
  });
});

describe('ingredientInInventory', () => {
  it('matches partial spice names', () => {
    expect(ingredientInInventory('Chilli powder', ['Chilli Powder'])).toBe(true);
  });
});

describe('missingIngredientsFromPantry', () => {
  it('skips common pantry staples', () => {
    expect(missingIngredientsFromPantry(['salt', 'onion'], [])).toEqual(['onion']);
  });
});
