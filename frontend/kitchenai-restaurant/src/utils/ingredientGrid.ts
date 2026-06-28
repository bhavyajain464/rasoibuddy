import { useMemo } from 'react';

export const INGREDIENT_GRID_COLUMNS = 3;
export const INGREDIENT_GRID_GAP = 6;
export const INGREDIENT_GRID_PAD = 10;

export function ingredientGridCellWidth(windowWidth: number): number {
  const inner =
    windowWidth - INGREDIENT_GRID_PAD * 2 - INGREDIENT_GRID_GAP * (INGREDIENT_GRID_COLUMNS - 1);
  return Math.floor(inner / INGREDIENT_GRID_COLUMNS);
}

export function useIngredientGridCellWidth(windowWidth: number) {
  return useMemo(() => ingredientGridCellWidth(windowWidth), [windowWidth]);
}
