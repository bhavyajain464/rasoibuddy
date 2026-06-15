import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Menu, Text } from 'react-native-paper';
import { MealTagPill, mealTagPillRowStyle } from './MealTagPill';
import { BottomSheet } from '../BottomSheet';
import { DishSearchOverlay } from '../DishSearchOverlay';
import type { MealOfDayMeal } from '../MealOfDayCard';
import { DishImage } from '../DishImage';
import { formatWeekPlanDayLabel, todayDateKey, type WeekPlanDay } from './WeekPlanCarousel';
import * as api from '../../services/api';
import type { WeekPlanDayResponse } from '../../services/api';
import type { CatalogDishSearchItem } from '../../data/dishCatalogSearch';
import { showAppError, showAppInfo, showAppSuccess } from '../../utils/alertMessage';
import { useAppRefresh } from '../../context/AppRefreshContext';
import { useIngredientCatalog } from '../../hooks/useIngredientCatalog';
import { mealIngredientsMissingFromPantry } from '../../utils/ingredientPantryMatch';
import { hiddenMajorIngredientCount, majorIngredients } from '../../utils/mealIngredients';
import { normalizeSuggestedShoppingLine } from '../../utils/ingredientUnits';
import { palette } from '../../theme';

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'] as const;

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

function mealsInOrder(meals: MealOfDayMeal[]): MealOfDayMeal[] {
  const bySlot = new Map<string, MealOfDayMeal>();
  for (const meal of meals) {
    const slot = meal.meal_slot?.toLowerCase();
    if (slot) bySlot.set(slot, meal);
  }
  return SLOT_ORDER.map((slot) => bySlot.get(slot)).filter(Boolean) as MealOfDayMeal[];
}

function mealsFromDayResponse(res: WeekPlanDayResponse): MealOfDayMeal[] {
  const cat = res.categories?.find((c) => c.id === 'meal_of_day') ?? res.categories?.[0];
  return (cat?.meals ?? []).map((m) => ({
    meal_slot: m.meal_slot,
    dish_id: m.dish_id,
    name: m.name,
    description: m.description,
    ingredients: m.ingredients ?? [],
    items_to_order: m.items_to_order,
    pairs_with: m.pairs_with,
    cooking_time_mins: m.cooking_time_mins,
    difficulty: m.difficulty,
    why_this_meal: m.why_this_meal,
  }));
}

type Props = {
  visible: boolean;
  day: WeekPlanDay | null;
  anchorDate?: string;
  cookProfileReady: boolean;
  onDismiss: () => void;
  onDayUpdated: (day: WeekPlanDay) => void;
  navigation: { navigate: (screen: string, params?: object) => void };
};

export function WeekPlanDaySheet({
  visible,
  day,
  anchorDate,
  cookProfileReady,
  onDismiss,
  onDayUpdated,
  navigation,
}: Props) {
  const { bump } = useAppRefresh();
  const { catalog } = useIngredientCatalog();
  const [refreshingSlot, setRefreshingSlot] = useState<string | null>(null);
  const [changeMenuSlot, setChangeMenuSlot] = useState<string | null>(null);
  const [searchSlot, setSearchSlot] = useState<string | null>(null);
  const [addingShoppingSlot, setAddingShoppingSlot] = useState<string | null>(null);
  const [selectedPairsBySlot, setSelectedPairsBySlot] = useState<Record<string, string[]>>({});
  const [inventoryNames, setInventoryNames] = useState<string[]>([]);

  useEffect(() => {
    setSelectedPairsBySlot({});
  }, [day?.date]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void api.fetchInventoryBuckets(['active', 'expiring']).then((buckets) => {
      if (!active) return;
      const names = [...(buckets.active ?? []), ...(buckets.expiring ?? [])]
        .map((item) => item.canonical_name.trim())
        .filter(Boolean);
      setInventoryNames(names);
    }).catch(() => {
      if (active) setInventoryNames([]);
    });
    return () => {
      active = false;
    };
  }, [visible, day?.date]);

  const today = anchorDate || todayDateKey();
  const title = day ? formatWeekPlanDayLabel(day.date, today) : 'Day plan';
  const orderedMeals = useMemo(() => (day ? mealsInOrder(day.meals) : []), [day]);

  useEffect(() => {
    setChangeMenuSlot(null);
    if (!visible) setSearchSlot(null);
  }, [day?.date, visible]);

  const applyDayResponse = (res: WeekPlanDayResponse, successLabel: string) => {
    if (!day) return;
    onDayUpdated({ date: day.date, meals: mealsFromDayResponse(res) });
    showAppSuccess(successLabel);
  };

  const handleRegenerateWithAI = async (mealSlot: string) => {
    if (!day || !mealSlot) return;
    setRefreshingSlot(mealSlot);
    try {
      const res = await api.refreshWeekPlanDay(day.date, mealSlot);
      applyDayResponse(res, `${SLOT_LABELS[mealSlot] ?? mealSlot} updated`);
    } catch {
      showAppError('Could not regenerate this meal. Try again.');
    } finally {
      setRefreshingSlot(null);
    }
  };

  const handleSelectCatalogDish = async (dish: CatalogDishSearchItem) => {
    if (!day || !searchSlot) return;
    const slot = searchSlot;
    setSearchSlot(null);
    setRefreshingSlot(slot);
    try {
      const res = await api.setWeekPlanDish(day.date, slot, dish.id);
      applyDayResponse(res, `${SLOT_LABELS[slot] ?? slot} set to ${dish.name}`);
    } catch {
      showAppError('Could not update this meal. Try again.');
    } finally {
      setRefreshingSlot(null);
    }
  };

  const handleAddToShopping = async (meal: MealOfDayMeal) => {
    const items = mealIngredientsMissingFromPantry(meal, inventoryNames);
    if (!items.length) {
      showAppInfo('Everything for this meal is already in your pantry.');
      return;
    }
    const slot = meal.meal_slot ?? 'meal';
    setAddingShoppingSlot(slot);
    try {
      await api.addBulkShoppingItems(
        items.map((name) => normalizeSuggestedShoppingLine(catalog, { name, qty: 0, unit: 'pcs' })),
      );
      showAppSuccess(`Added ${items.length} item${items.length === 1 ? '' : 's'} to shopping list`);
      bump('shopping');
    } catch {
      showAppError('Could not add to shopping list.');
    } finally {
      setAddingShoppingSlot(null);
    }
  };

  const togglePairSelection = (slot: string, item: string) => {
    setSelectedPairsBySlot((prev) => {
      const current = new Set(prev[slot] ?? []);
      if (current.has(item)) {
        current.delete(item);
      } else {
        current.add(item);
      }
      return { ...prev, [slot]: Array.from(current) };
    });
  };

  const cookSendItemCount = (slot: string) => 1 + (selectedPairsBySlot[slot]?.length ?? 0);

  const handleSendToCook = (meal: MealOfDayMeal) => {
    if (!cookProfileReady) {
      showAppInfo('Add your cook profile with a WhatsApp number on the Cook tab first.');
      navigation.navigate('Cook');
      return;
    }
    const slot = meal.meal_slot?.toLowerCase() ?? '';
    const pairs = selectedPairsBySlot[slot] ?? [];
    onDismiss();
    navigation.navigate('Cook', { dishItems: [meal.name, ...pairs] });
  };

  return (
    <>
    <BottomSheet
      visible={visible && searchSlot === null}
      onDismiss={onDismiss}
      title={title}
      subtitle={day?.date}
      scrollable
      maxHeightRatio={0.92}
    >
      {!day || !orderedMeals.length ? (
        <Text variant="bodyMedium" style={styles.empty}>
          No meals planned for this day yet.
        </Text>
      ) : (
        orderedMeals.map((meal) => {
          const slot = meal.meal_slot?.toLowerCase() ?? '';
          const slotLabel = SLOT_LABELS[slot] ?? slot;
          const ingredients = meal.ingredients ?? [];
          const displayIngredients = majorIngredients(ingredients);
          const hiddenIngredientCount = hiddenMajorIngredientCount(ingredients);
          const pairsWith = meal.pairs_with?.filter((s) => s.trim()) ?? [];
          const shopItems = mealIngredientsMissingFromPantry(meal, inventoryNames);
          const selectedPairs = selectedPairsBySlot[slot] ?? [];

          return (
            <View key={`${day.date}-${slot}`} style={styles.mealBlock}>
              <View style={styles.mealHeader}>
                <Text variant="labelLarge" style={styles.slotLabel}>{slotLabel}</Text>
                <View style={styles.mealNameRow}>
                  <Text variant="titleMedium" style={styles.mealNameLine}>
                    <Text style={styles.mealName}>{meal.name}</Text>
                    {meal.cooking_time_mins ? (
                      <Text style={styles.meta}>
                        {' '}{meal.cooking_time_mins} min · {meal.difficulty ?? 'easy'}
                      </Text>
                    ) : null}
                  </Text>
                  <View style={styles.changeBtnWrap}>
                    <Menu
                      visible={changeMenuSlot === slot}
                      onDismiss={() => setChangeMenuSlot(null)}
                      anchor={
                        <Button
                          mode="text"
                          compact
                          onPress={() => setChangeMenuSlot(slot)}
                          loading={refreshingSlot === slot}
                          disabled={refreshingSlot !== null}
                          style={styles.changeBtn}
                          labelStyle={styles.changeBtnLabel}
                          textColor={palette.primary}
                          accessibilityLabel={`Change ${slotLabel}`}
                        >
                          Change
                        </Button>
                      }
                    >
                      <Menu.Item
                        title="Regenerate with AI"
                        leadingIcon="auto-fix"
                        onPress={() => {
                          setChangeMenuSlot(null);
                          void handleRegenerateWithAI(slot);
                        }}
                      />
                      <Menu.Item
                        title="Choose from catalog"
                        leadingIcon="magnify"
                        onPress={() => {
                          setChangeMenuSlot(null);
                          setSearchSlot(slot);
                        }}
                      />
                    </Menu>
                  </View>
                </View>
              </View>
              <DishImage
                dishId={meal.dish_id}
                dishName={meal.name}
                variant="card"
                borderRadius={14}
                style={styles.mealHero}
                accessibilityLabel={`Photo of ${meal.name}`}
              />

              {meal.description?.trim() ? (
                <Text variant="bodySmall" style={styles.description}>{meal.description}</Text>
              ) : null}

              {displayIngredients.length > 0 ? (
                <>
                  <Text variant="labelSmall" style={styles.ingLabel}>Ingredients</Text>
                  <View style={mealTagPillRowStyle.wrap}>
                    {displayIngredients.map((ing, i) => (
                      <MealTagPill key={i} label={ing} variant="ingredient" />
                    ))}
                    {hiddenIngredientCount > 0 ? (
                      <MealTagPill label={`+${hiddenIngredientCount} more`} variant="ingredient" />
                    ) : null}
                  </View>
                </>
              ) : null}

              {pairsWith.length > 0 ? (
                <>
                  <Text variant="labelSmall" style={styles.pairsLabel}>
                    Pairs well with — tap to include with message
                  </Text>
                  <View style={mealTagPillRowStyle.wrap}>
                    {pairsWith.map((item, i) => {
                      const pairSelected = selectedPairs.includes(item);
                      return (
                        <MealTagPill
                          key={i}
                          label={item}
                          variant="pairs"
                          selected={pairSelected}
                          icon={pairSelected ? 'check' : 'silverware-fork-knife'}
                          onPress={() => togglePairSelection(slot, item)}
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}

              {shopItems.length > 0 ? (
                <>
                  <Text variant="labelSmall" style={styles.orderLabel}>Need to order</Text>
                  <View style={mealTagPillRowStyle.wrap}>
                    {shopItems.map((item, i) => (
                      <MealTagPill
                        key={i}
                        label={item}
                        variant="order"
                        icon="cart-outline"
                      />
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.actions}>
                <Button
                  mode="outlined"
                  icon="cart-plus"
                  compact
                  onPress={() => void handleAddToShopping(meal)}
                  loading={addingShoppingSlot === slot}
                  disabled={addingShoppingSlot !== null || shopItems.length === 0}
                  style={styles.actionBtn}
                  textColor={palette.primary}
                >
                  {shopItems.length === 0
                    ? 'All in pantry'
                    : `Add to list (${shopItems.length})`}
                </Button>
                <Button
                  mode="contained"
                  icon="chef-hat"
                  compact
                  onPress={() => handleSendToCook(meal)}
                  buttonColor={cookProfileReady ? '#25D366' : '#9E9E9E'}
                  disabled={!cookProfileReady}
                  style={styles.actionBtn}
                >
                  {cookProfileReady && cookSendItemCount(slot) > 1
                    ? `Send to cook (${cookSendItemCount(slot)} items)`
                    : 'Send to cook'}
                </Button>
              </View>
            </View>
          );
        })
      )}
    </BottomSheet>

    <DishSearchOverlay
      visible={searchSlot !== null}
      mealSlot={searchSlot ?? undefined}
      onClose={() => setSearchSlot(null)}
      onSelect={(dish) => void handleSelectCatalogDish(dish)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { color: '#888', textAlign: 'center', paddingVertical: 24 },
  mealBlock: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  mealHero: {
    marginBottom: 12,
  },
  mealHeader: {
    marginBottom: 8,
  },
  mealNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeBtnWrap: {
    flexShrink: 0,
  },
  changeBtn: {
    margin: 0,
  },
  changeBtnLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  slotLabel: { color: palette.primary, fontWeight: '700', marginBottom: 2 },
  mealNameLine: { flex: 1, minWidth: 0, lineHeight: 24 },
  mealName: { fontWeight: '700', color: '#333' },
  meta: { color: '#888', fontWeight: '400' },
  description: { color: '#666', marginBottom: 10, lineHeight: 18 },
  ingLabel: { color: '#333', fontWeight: '700', marginBottom: 6 },
  pairsLabel: { color: '#333', fontWeight: '700', marginBottom: 6 },
  orderLabel: { color: '#E65100', fontWeight: '700', marginBottom: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn: { borderRadius: 10 },
});
