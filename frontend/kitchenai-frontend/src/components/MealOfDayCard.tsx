import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Text, Surface, ActivityIndicator, Icon } from 'react-native-paper';

export interface MealOfDayMeal {
  meal_slot?: string;
  name: string;
  description: string;
  why_this_meal?: string;
  cooking_time_mins?: number;
  difficulty?: string;
  ingredients?: string[];
  items_to_order?: string[];
  pairs_with?: string[];
}

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'] as const;

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const H_PAD = 24;
const CARD_PAD = 14;
const MEALS_PAD_V = 4;
const COL_GAP = 8;
const COL_COUNT = 3;
const MIN_COL_WIDTH = 96;
const SLOT_LABEL_HEIGHT = 16;
const MEAL_NAME_LINES = 3;
const MEAL_NAME_LINE_HEIGHT = 17;
const MEAL_NAME_BLOCK_HEIGHT = MEAL_NAME_LINES * MEAL_NAME_LINE_HEIGHT;
const TIME_ROW_HEIGHT = 16;

type SlotEntry = { slot: (typeof SLOT_ORDER)[number]; meal?: MealOfDayMeal };

function orderedSlots(meals: MealOfDayMeal[]): SlotEntry[] {
  const bySlot = new Map<string, MealOfDayMeal>();
  for (const meal of meals) {
    const key = meal.meal_slot?.toLowerCase();
    if (key) bySlot.set(key, meal);
  }
  return SLOT_ORDER.map((slot) => ({ slot, meal: bySlot.get(slot) }));
}

function useColumnLayout() {
  const { width: screenWidth } = useWindowDimensions();

  return useMemo(() => {
    const available = screenWidth - H_PAD * 2 - CARD_PAD * 2;
    const ideal = (available - (COL_COUNT - 1) * COL_GAP) / COL_COUNT;
    const colWidth = Math.max(MIN_COL_WIDTH, Math.floor(ideal));
    const rowWidth = COL_COUNT * colWidth + (COL_COUNT - 1) * COL_GAP;
    const scrollable = rowWidth > available + 1;
    return { colWidth, scrollable };
  }, [screenWidth]);
}

function MealColumn({
  entry,
  width,
  flex,
  showDivider,
}: {
  entry: SlotEntry;
  width?: number;
  flex?: number;
  showDivider: boolean;
}) {
  const { slot, meal } = entry;
  const label = SLOT_LABELS[slot]?.toUpperCase() ?? slot.toUpperCase();

  return (
    <View
      style={[
        styles.column,
        width != null && { width },
        flex != null && { flex },
        showDivider && styles.columnDivider,
      ]}
    >
      <View style={styles.slotLabelWrap}>
        <Text variant="labelSmall" style={styles.slotLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.mealNameBlock}>
        <Text variant="bodySmall" style={styles.mealName} numberOfLines={MEAL_NAME_LINES}>
          {meal?.name?.trim() || '—'}
        </Text>
      </View>
      <View style={styles.timeRow}>
        {meal?.cooking_time_mins ? (
          <>
            <Icon source="clock-outline" size={12} color="#888" />
            <Text variant="labelSmall" style={styles.timeText}>
              {meal.cooking_time_mins} min
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

interface MealOfDayCardProps {
  meals: MealOfDayMeal[];
  loading: boolean;
  notReady?: boolean;
  onPress: () => void;
}

export function MealOfDayCard({
  meals,
  loading,
  notReady,
  onPress,
}: MealOfDayCardProps) {
  const { colWidth, scrollable } = useColumnLayout();
  const slots = useMemo(() => orderedSlots(meals), [meals]);

  if (loading) {
    return (
      <Surface style={[styles.card, styles.centered]} elevation={1}>
        <ActivityIndicator size="small" color="#2E7D32" />
        <Text variant="bodySmall" style={styles.loadingText}>
          Loading today&apos;s meals…
        </Text>
      </Surface>
    );
  }

  const ready = meals.length > 0 && !notReady;

  if (!ready) {
    return (
      <Surface style={[styles.card, styles.cardRow]} elevation={1}>
        <View style={styles.iconWrap}>
          <Icon source="moon-waning-crescent" size={26} color="#5D4037" />
        </View>
        <View style={styles.body}>
          <Text variant="titleSmall" style={styles.title}>
            Meal of the Day
          </Text>
          <Text variant="bodySmall" style={styles.sub}>
            Breakfast, lunch, and dinner refresh at midnight (12:00 AM IST).
          </Text>
        </View>
      </Surface>
    );
  }

  const columns = slots.map((entry, idx) => (
    <MealColumn
      key={entry.slot}
      entry={entry}
      width={scrollable ? colWidth : undefined}
      flex={scrollable ? undefined : 1}
      showDivider={!scrollable && idx < slots.length - 1}
    />
  ));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.92 }]}
    >
      <Surface style={styles.card} elevation={2}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Icon source="star" size={18} color="#F9A825" />
            <Text variant="titleSmall" style={styles.headerTitle}>
              Meal of the Day
            </Text>
          </View>
          <Text variant="labelSmall" style={styles.prefsText} numberOfLines={1}>
            Based on your preferences
          </Text>
        </View>

        <View style={styles.mealsContent}>
          {scrollable ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.columnsScroll}
            >
              {columns}
            </ScrollView>
          ) : (
            <View style={styles.columnsRow}>{columns}</View>
          )}
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: H_PAD,
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    borderRadius: 16,
    padding: CARD_PAD,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 20,
    marginHorizontal: H_PAD,
    marginTop: 8,
  },
  loadingText: {
    marginTop: 8,
    color: '#666',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardRow: {
    flexDirection: 'row',
    marginHorizontal: H_PAD,
    marginTop: 8,
  },
  body: { flex: 1 },
  title: { fontWeight: '700', color: '#1A1A1A' },
  sub: { color: '#666', marginTop: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  headerTitle: {
    fontWeight: '700',
    color: '#1A1A1A',
  },
  prefsText: {
    color: '#888',
    flexShrink: 0,
    maxWidth: '46%',
    textAlign: 'right',
  },
  mealsContent: {
    paddingVertical: MEALS_PAD_V,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: COL_GAP,
  },
  columnsScroll: {
    flexDirection: 'row',
    gap: COL_GAP,
    paddingRight: 4,
  },
  column: {
    minWidth: 0,
    minHeight:
      SLOT_LABEL_HEIGHT + 6 + MEAL_NAME_BLOCK_HEIGHT + 6 + TIME_ROW_HEIGHT,
  },
  slotLabelWrap: {
    height: SLOT_LABEL_HEIGHT,
    marginBottom: 6,
    justifyContent: 'center',
  },
  mealNameBlock: {
    height: MEAL_NAME_BLOCK_HEIGHT,
    justifyContent: 'center',
  },
  columnDivider: {
    borderRightWidth: 1,
    borderRightColor: '#E8F5E9',
    paddingRight: COL_GAP,
    marginRight: 0,
  },
  slotLabel: {
    color: '#66BB6A',
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 10,
  },
  mealName: {
    fontWeight: '600',
    color: '#1B5E20',
    lineHeight: MEAL_NAME_LINE_HEIGHT,
    textAlignVertical: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: TIME_ROW_HEIGHT,
    marginTop: 6,
  },
  timeText: {
    color: '#888',
    fontSize: 11,
  },
});
