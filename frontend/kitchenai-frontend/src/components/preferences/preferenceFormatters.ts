import {
  COOKING_SKILLS,
  DIET_RESTRICTION_OPTIONS,
  DIET_TYPE_OPTIONS,
  SPICE_LEVELS,
} from '../../constants/userPreferences';

export function formatHouseholdSummary(size: number): string {
  return size === 1 ? '1 person' : `${size} people`;
}

export function formatSpiceSummary(level: string): string {
  const hit = SPICE_LEVELS.find(s => s.id === level);
  if (hit) return hit.id === 'extra_spicy' ? 'Extra Spicy' : hit.label;
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function formatCookingSkillSummary(skill: string): string {
  const hit = COOKING_SKILLS.find(s => s.id === skill);
  return hit?.label ?? skill.charAt(0).toUpperCase() + skill.slice(1);
}

export function formatDietSummary(tags: string[]): string {
  if (tags.length === 0) return 'Not set';
  const parts = tags.map(tag => {
    const type = DIET_TYPE_OPTIONS.find(d => d.id === tag);
    if (type) return type.label === 'Veg' ? 'Vegetarian' : type.label;
    const rest = DIET_RESTRICTION_OPTIONS.find(d => d.id === tag);
    if (rest) return rest.label;
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  });
  return parts.join(' · ');
}

export function formatCuisinesSummary(cuisines: string[]): string {
  if (cuisines.length === 0) return 'None selected';
  if (cuisines.length === 1) return cuisines[0];
  if (cuisines.length === 2) {
    const short = (c: string) => c.replace(' Indian', '');
    return `${short(cuisines[0])} & ${short(cuisines[1])} Indian`;
  }
  const first = cuisines[0].replace(' Indian', '');
  const second = cuisines[1].replace(' Indian', '');
  return `${first} & ${second} Indian +${cuisines.length - 2}`;
}

export function formatListSummary(items: string[], empty = 'None'): string {
  if (items.length === 0) return empty;
  if (items.length <= 2) return items.join(', ');
  return `${items.slice(0, 2).join(', ')} +${items.length - 2}`;
}

export function formatMemoriesSummary(count: number): string {
  return count === 1 ? '1 note' : `${count} notes`;
}
