export const SPICE_LEVELS = [
  { id: 'mild', label: 'Mild', emoji: '🌶️' },
  { id: 'medium', label: 'Medium', emoji: '🌶️' },
  { id: 'spicy', label: 'Spicy', emoji: '🌶️🌶️' },
  { id: 'extra_spicy', label: 'Extra', emoji: '🔥' },
] as const;

export const COOKING_SKILLS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const;

/** Primary diet — typically one selection. */
export const DIET_TYPE_OPTIONS = [
  { id: 'vegetarian', label: 'Veg' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'eggetarian', label: 'Eggetarian' },
  { id: 'non-veg', label: 'Non-veg' },
] as const;

/** Additional restrictions — multi-select. */
export const DIET_RESTRICTION_OPTIONS = [
  { id: 'jain', label: 'Jain' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'lactose-free', label: 'Lactose-free' },
  { id: 'keto', label: 'Keto' },
  { id: 'low-carb', label: 'Low-carb' },
] as const;

export const ONBOARDING_CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Bengali', 'Gujarati',
  'Punjabi', 'Chinese', 'Italian', 'Continental', 'Thai',
];

export const PROFILE_CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Bengali', 'Gujarati',
  'Punjabi', 'Rajasthani', 'Maharashtrian', 'Kerala',
  'Chinese', 'Italian', 'Continental', 'Thai',
];

export type SpiceLevelId = (typeof SPICE_LEVELS)[number]['id'];
export type CookingSkillId = (typeof COOKING_SKILLS)[number]['id'];
export type DietTypeId = (typeof DIET_TYPE_OPTIONS)[number]['id'];
export type DietRestrictionId = (typeof DIET_RESTRICTION_OPTIONS)[number]['id'];

export interface UserPreferencesFormValues {
  householdSize: number;
  spiceLevel: SpiceLevelId | string;
  cookingSkill: CookingSkillId | string;
  dietaryTags: string[];
  favCuisines: string[];
  allergies: string[];
  dislikes: string[];
}

export function splitDietaryTags(tags: string[]): {
  dietType: string | null;
  restrictions: string[];
} {
  const dietTypeIds = DIET_TYPE_OPTIONS.map(d => d.id);
  const restrictionIds = DIET_RESTRICTION_OPTIONS.map(d => d.id);
  const dietType = tags.find(t => dietTypeIds.includes(t as DietTypeId)) ?? null;
  const restrictions = tags.filter(t => restrictionIds.includes(t as DietRestrictionId));
  return { dietType, restrictions };
}

export function mergeDietaryTags(dietType: string | null, restrictions: string[]): string[] {
  const out: string[] = [];
  if (dietType) out.push(dietType);
  for (const r of restrictions) {
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

export function prefsSnapshot(values: UserPreferencesFormValues): string {
  return JSON.stringify(values);
}
