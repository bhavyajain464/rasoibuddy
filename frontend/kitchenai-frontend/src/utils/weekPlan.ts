import type { MealOfDayMeal } from '../components/MealOfDayCard';
import type { WeekPlanDay } from '../components/meals/WeekPlanCarousel';
import { todayDateKey } from '../components/meals/WeekPlanCarousel';
import type { WeekPlanDayResponse } from '../services/api';

export function mapWeekPlanDayResponse(d: WeekPlanDayResponse): WeekPlanDay {
  const cat = d.categories?.find((c) => c.id === 'meal_of_day') ?? d.categories?.[0];
  return {
    date: d.date,
    meals: (cat?.meals ?? []).map((m) => ({
      meal_slot: m.meal_slot,
      dish_id: m.dish_id,
      name: m.name,
      description: m.description ?? '',
      ingredients: m.ingredients ?? [],
      items_to_order: m.items_to_order,
      pairs_with: m.pairs_with,
      cooking_time_mins: m.cooking_time_mins,
      difficulty: m.difficulty,
      why_this_meal: m.why_this_meal,
    })),
  };
}

export function parseWeekPlanDays(days: WeekPlanDayResponse[] | undefined): WeekPlanDay[] {
  if (!days?.length) return [];
  return days.map(mapWeekPlanDayResponse);
}

export function todayMealsFromWeekPlanDays(planDays: WeekPlanDay[], date = todayDateKey()): MealOfDayMeal[] {
  const day = planDays.find((d) => d.date === date);
  return (day?.meals ?? []).filter((m) => m?.name?.trim());
}
