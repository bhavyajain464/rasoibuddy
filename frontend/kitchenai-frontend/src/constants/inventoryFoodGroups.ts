import type { InventoryFoodGroup } from '../types';

/** Mirrors backend ingredient_groups.json — used for filter labels when API groups load. */
export const INVENTORY_FOOD_GROUPS: InventoryFoodGroup[] = [
  { id: 'vegetables', label: 'Vegetables', sort: 10 },
  { id: 'fruits', label: 'Fruits', sort: 20 },
  { id: 'spices', label: 'Spices', sort: 30 },
  { id: 'dairy', label: 'Dairy', sort: 40 },
  { id: 'grains_pulses', label: 'Grains & Pulses', sort: 50 },
  { id: 'oils_fats', label: 'Oils & Fats', sort: 60 },
  { id: 'non_veg', label: 'Non-Veg', sort: 70 },
  { id: 'condiments', label: 'Condiments', sort: 80 },
  { id: 'bakery', label: 'Bakery', sort: 90 },
  { id: 'beverages', label: 'Beverages', sort: 100 },
  { id: 'prepared', label: 'Prepared', sort: 110 },
  { id: 'other', label: 'Other', sort: 999 },
];

export function foodGroupLabel(id: string, groups: InventoryFoodGroup[]): string {
  const normalized = id === 'protein' ? 'non_veg' : id;
  return groups.find((g) => g.id === normalized)?.label ?? normalized.replace(/_/g, ' ');
}

export function hidesNonVegGroup(dietaryTags: string[]): boolean {
  return dietaryTags.some((tag) => {
    const lower = tag.toLowerCase();
    return lower.includes('vegetarian') || lower.includes('vegan') || lower.includes('jain');
  });
}

/** Client-side fallback when /inventory/food-groups is unavailable. */
export function foodGroupsForDiet(
  groups: InventoryFoodGroup[],
  dietaryTags: string[],
): InventoryFoodGroup[] {
  if (!hidesNonVegGroup(dietaryTags)) return groups;
  return groups.filter((g) => g.id !== 'non_veg' && g.id !== 'protein');
}
