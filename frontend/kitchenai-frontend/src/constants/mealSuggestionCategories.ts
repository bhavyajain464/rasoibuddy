export const MEAL_SUGGESTION_CATEGORIES = [
  { id: 'daily', title: 'Daily', subtitle: 'Just a dish idea', icon: 'calendar-today' },
  { id: 'rescue_meal', title: 'Rescue', subtitle: 'Use expiring items', icon: 'alert-circle-outline' },
  { id: 'most_healthy', title: 'Healthy', subtitle: 'Nutrient-rich picks', icon: 'heart-pulse' },
  { id: 'most_tasty', title: 'Tasty', subtitle: 'Crowd pleasers', icon: 'fire' },
  { id: 'long_lasting', title: 'Meal Prep', subtitle: 'Cook now, eat later', icon: 'clock-outline' },
] as const;

/** Includes week-plan shortcut tile on Meals tab. */
export const MEALS_TAB_CATEGORIES = [
  ...MEAL_SUGGESTION_CATEGORIES,
  { id: 'today_plan', title: 'Meal of Day', subtitle: 'Your breakfast, lunch & dinner', icon: 'star-circle' },
] as const;

export const MEAL_TYPE_FILTERS = [
  { id: 'lunch_dinner', label: 'Lunch / Dinner' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert / Sweets' },
  { id: 'all', label: 'Any meal' },
] as const;

export type MealSuggestionCategoryId = (typeof MEAL_SUGGESTION_CATEGORIES)[number]['id'];
export type MealTypeFilterId = (typeof MEAL_TYPE_FILTERS)[number]['id'];

export function defaultMealTypeForSlot(slot: string): MealTypeFilterId {
  const normalized = slot.toLowerCase();
  if (normalized === 'breakfast') return 'breakfast';
  if (normalized === 'dinner') return 'dinner';
  return 'lunch_dinner';
}
