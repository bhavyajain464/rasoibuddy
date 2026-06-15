import React, { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { ActivityIndicator, Icon, Surface, Text } from 'react-native-paper';
import type { MealOfDayMeal } from '../MealOfDayCard';
import { DishImage } from '../DishImage';

export type WeekPlanDay = {
  date: string;
  meals: MealOfDayMeal[];
};

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'] as const;

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const H_PAD = 24;
const CARD_PAD = 14;
const PILL_GAP = 6;
const PILL_WIDTH = 46;
const PILL_HEIGHT = 64;
const DATE_CIRCLE = 26;
const COL_GAP = 8;
const COL_COUNT = 3;
const MIN_COL_WIDTH = 96;
const SLOT_LABEL_HEIGHT = 16;
const MEAL_NAME_LINES = 2;
const MEAL_NAME_LINE_HEIGHT = 17;
const MEAL_NAME_BLOCK_HEIGHT = MEAL_NAME_LINES * MEAL_NAME_LINE_HEIGHT;
const THUMB_WIDTH: number | `${number}%` = '100%';
const TIME_ROW_HEIGHT = 16;

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function formatWeekPlanDayLabel(dateKey: string, today: string): string {
  if (dateKey === today) return 'Today';
  if (dateKey === addDays(today, 1)) return 'Tomorrow';
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function weekdayShort(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function dayOfMonth(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDate();
}

function mealsBySlot(meals: MealOfDayMeal[]): Record<string, MealOfDayMeal | undefined> {
  const out: Record<string, MealOfDayMeal | undefined> = {};
  for (const meal of meals) {
    const slot = meal.meal_slot?.toLowerCase();
    if (slot) out[slot] = meal;
  }
  return out;
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

function PlanMealColumn({
  slot,
  meal,
  width,
  flex,
  showDivider,
}: {
  slot: (typeof SLOT_ORDER)[number];
  meal?: MealOfDayMeal;
  width?: number;
  flex?: number;
  showDivider: boolean;
}) {
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
        <Text variant="labelSmall" style={styles.columnSlotLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <DishImage
        dishId={meal?.dish_id}
        dishName={meal?.name}
        variant="card"
        width={THUMB_WIDTH}
        borderRadius={10}
        style={styles.mealThumb}
        accessibilityLabel={meal?.name ? `${label}: ${meal.name}` : label}
      />
      <View style={styles.mealNameBlock}>
        <Text variant="bodySmall" style={styles.columnMealName} numberOfLines={MEAL_NAME_LINES}>
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

function SelectedDayCard({
  label,
  meals,
  onPress,
}: {
  label: string;
  meals: MealOfDayMeal[];
  onPress: () => void;
}) {
  const { colWidth, scrollable } = useColumnLayout();
  const bySlot = useMemo(() => mealsBySlot(meals), [meals]);

  const columns = SLOT_ORDER.map((slot, idx) => (
    <PlanMealColumn
      key={slot}
      slot={slot}
      meal={bySlot[slot]}
      width={scrollable ? colWidth : undefined}
      flex={scrollable ? undefined : 1}
      showDivider={!scrollable && idx < SLOT_ORDER.length - 1}
    />
  ));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.dayCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label} meal plan. Tap for full details.`}
    >
      <Surface style={styles.dayCard} elevation={1}>
        <Text variant="titleSmall" style={styles.dayCardTitle}>{label}</Text>
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

type Props = {
  days: WeekPlanDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onDayPress: (date: string) => void;
  loading?: boolean;
  anchorDate?: string;
};

function WeekDayPill({
  dateKey,
  selected,
  onPress,
}: {
  dateKey: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillPress,
        pressed && styles.pillPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${weekdayShort(dateKey)} ${dayOfMonth(dateKey)}`}
    >
      <View style={[styles.pill, selected && styles.pillSelected]}>
        <Text style={[styles.weekday, selected && styles.weekdaySelected]}>
          {weekdayShort(dateKey)}
        </Text>
        <View style={[styles.dateCircle, selected && styles.dateCircleSelected]}>
          <Text style={[styles.dateNum, selected && styles.dateNumSelected]}>
            {dayOfMonth(dateKey)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function WeekPlanCarousel({
  days,
  selectedDate,
  onSelectDate,
  onDayPress,
  loading = false,
  anchorDate,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const today = anchorDate || todayDateKey();

  const sortedDays = useMemo(
    () => [...days].sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  );

  const frameWidth = screenWidth - H_PAD * 2;
  const count = sortedDays.length;
  const minGap = PILL_GAP;
  const evenGap = count > 0 ? (frameWidth - count * PILL_WIDTH) / (count + 1) : 0;
  const fitsInFrame = evenGap >= 2;
  const stripGap = fitsInFrame ? evenGap : minGap;
  const snapInterval = PILL_WIDTH + stripGap;
  const scrollContentWidth = count * PILL_WIDTH + Math.max(0, count - 1) * stripGap;

  const selectedLabel = formatWeekPlanDayLabel(selectedDate, today);
  const selectedDay = sortedDays.find((d) => d.date === selectedDate) ?? sortedDays[0];

  useEffect(() => {
    if (fitsInFrame) return;
    const index = sortedDays.findIndex((d) => d.date === selectedDate);
    if (index < 0) return;
    scrollRef.current?.scrollTo({ x: index * snapInterval, animated: true });
  }, [selectedDate, sortedDays, snapInterval, fitsInFrame]);

  const pills = sortedDays.map((day) => (
    <WeekDayPill
      key={day.date}
      dateKey={day.date}
      selected={day.date === selectedDate}
      onPress={() => onSelectDate(day.date)}
    />
  ));

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#2E7D32" />
        <Text variant="bodySmall" style={styles.loadingText}>Loading your kitchen plan…</Text>
      </View>
    );
  }

  if (!sortedDays.length) {
    return (
      <View style={styles.wrap}>
        <View style={styles.emptyCard}>
          <Text variant="bodySmall" style={styles.emptyText}>
            Your 7-day plan appears at midnight (12:00 AM IST).
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {fitsInFrame ? (
        <View
          style={[
            styles.stripFit,
            {
              width: frameWidth,
              height: PILL_HEIGHT,
              paddingHorizontal: evenGap,
              gap: evenGap,
            },
          ]}
        >
          {pills}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          snapToInterval={snapInterval}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={[
            styles.stripScroll,
            scrollContentWidth < frameWidth && {
              paddingHorizontal: (frameWidth - scrollContentWidth) / 2,
            },
          ]}
          style={{ width: frameWidth, height: PILL_HEIGHT }}
        >
          {pills}
        </ScrollView>
      )}

      {selectedDay ? (
        <SelectedDayCard
          label={selectedLabel}
          meals={selectedDay.meals}
          onPress={() => onDayPress(selectedDay.date)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: H_PAD,
  },
  stripFit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PILL_GAP,
  },
  pillPress: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    flexShrink: 0,
  },
  pillPressed: {
    opacity: 0.88,
  },
  pill: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#F0F1F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  pillSelected: {
    backgroundColor: '#FAD4B8',
  },
  weekday: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5C5C5C',
    letterSpacing: 0.1,
  },
  weekdaySelected: {
    color: '#3D3D3D',
    fontWeight: '700',
  },
  dateCircle: {
    width: DATE_CIRCLE,
    height: DATE_CIRCLE,
    borderRadius: DATE_CIRCLE / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleSelected: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dateNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  dateNumSelected: {
    color: '#1A1A1A',
  },
  dayCardPressed: {
    opacity: 0.92,
  },
  dayCard: {
    marginTop: 14,
    borderRadius: 16,
    padding: CARD_PAD,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  dayCardTitle: {
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  mealsContent: {
    paddingVertical: 4,
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
    minHeight: SLOT_LABEL_HEIGHT + 6 + MEAL_NAME_BLOCK_HEIGHT + 6 + TIME_ROW_HEIGHT + 24,
  },
  mealThumb: {
    marginBottom: 8,
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
  columnSlotLabel: {
    color: '#66BB6A',
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 10,
  },
  columnMealName: {
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
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
    marginHorizontal: H_PAD,
  },
  loadingText: { color: '#888' },
  emptyCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  emptyText: { color: '#777', textAlign: 'center' },
});
