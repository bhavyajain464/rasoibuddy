import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { ActivityIndicator, Icon, Surface, Text } from 'react-native-paper';
import type { MealOfDayMeal } from '../MealOfDayCard';
import { palette } from '../../theme';

export type WeekPlanDay = {
  date: string;
  meals: MealOfDayMeal[];
};

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'] as const;
const H_PAD = 24;
const CARD_GAP = 10;
const CARD_HEIGHT = 132;
const ARROW_SIZE = 34;
const ARROW_GUTTER = ARROW_SIZE + 12;

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
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function mealsBySlot(meals: MealOfDayMeal[]): Record<string, MealOfDayMeal | undefined> {
  const out: Record<string, MealOfDayMeal | undefined> = {};
  for (const meal of meals) {
    const slot = meal.meal_slot?.toLowerCase();
    if (slot) out[slot] = meal;
  }
  return out;
}

function CarouselScrollArrow({
  direction,
  onPress,
  visible,
}: {
  direction: 'left' | 'right';
  onPress: () => void;
  visible: boolean;
}) {
  if (!visible) return null;

  const icon = direction === 'left' ? 'chevron-left' : 'chevron-right';
  const label = direction === 'left' ? 'Scroll week plan left' : 'Scroll week plan right';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrowHit,
        direction === 'left' ? styles.arrowHitLeft : styles.arrowHitRight,
        pressed && styles.arrowHitPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.arrowCircle}>
        <Icon source={icon} size={22} color="#424242" />
      </View>
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
  const scrollXRef = useRef(0);
  const today = anchorDate || todayDateKey();

  const { cardWidth, frameWidth, snapInterval, scrollable } = useMemo(() => {
    const frame = screenWidth - H_PAD * 2;
    const width = Math.min(168, Math.floor(frame * 0.44));
    const rowWidth = days.length * width + Math.max(0, days.length - 1) * CARD_GAP;
    return {
      cardWidth: width,
      frameWidth: frame,
      snapInterval: width + CARD_GAP,
      scrollable: rowWidth > frame + 1,
    };
  }, [screenWidth, days.length]);

  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(scrollable);

  const sortedDays = useMemo(
    () => [...days].sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  );

  const updateArrowVisibility = useCallback(
    (x: number, contentWidth: number) => {
      if (!scrollable || contentWidth <= 0) {
        setShowLeftArrow(false);
        setShowRightArrow(scrollable);
        return;
      }
      setShowLeftArrow(x > 4);
      setShowRightArrow(x < contentWidth - frameWidth - 4);
    },
    [scrollable, frameWidth],
  );

  useEffect(() => {
    if (!scrollable) {
      setShowLeftArrow(false);
      setShowRightArrow(false);
      return;
    }
    setShowRightArrow(true);
    setShowLeftArrow(false);
  }, [scrollable]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollXRef.current = x;
      updateArrowVisibility(x, e.nativeEvent.contentSize.width);
    },
    [updateArrowVisibility],
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / snapInterval);
    const day = sortedDays[index];
    if (day && day.date !== selectedDate) {
      onSelectDate(day.date);
    }
  };

  const scrollNext = useCallback(() => {
    scrollRef.current?.scrollTo({ x: scrollXRef.current + snapInterval, animated: true });
  }, [snapInterval]);

  const scrollPrev = useCallback(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, scrollXRef.current - snapInterval), animated: true });
  }, [snapInterval]);

  useEffect(() => {
    const index = sortedDays.findIndex((d) => d.date === selectedDate);
    if (index < 0 || !scrollRef.current) return;
    const x = index * snapInterval;
    scrollRef.current.scrollTo({ x, animated: false });
    scrollXRef.current = x;
    updateArrowVisibility(x, sortedDays.length * cardWidth + Math.max(0, sortedDays.length - 1) * CARD_GAP);
  }, [selectedDate, sortedDays, snapInterval, cardWidth, updateArrowVisibility]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text variant="bodySmall" style={styles.loadingText}>Loading your kitchen plan…</Text>
      </View>
    );
  }

  if (!sortedDays.length) {
    return (
      <View style={styles.wrap}>
        <Text variant="titleMedium" style={styles.heading}>This week</Text>
        <Surface style={styles.emptyCard} elevation={0}>
          <Text variant="bodySmall" style={styles.emptyText}>
            Your 7-day plan appears at midnight (12:00 AM IST).
          </Text>
        </Surface>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text variant="titleMedium" style={styles.heading}>This week</Text>
      <Text variant="bodySmall" style={styles.subheading}>
        Shared for your kitchen · updates daily at midnight
      </Text>

      <View style={[styles.carouselFrame, { width: frameWidth, height: CARD_HEIGHT }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          snapToAlignment="start"
          decelerationRate="fast"
          nestedScrollEnabled
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onScrollEnd}
          onContentSizeChange={(w) => updateArrowVisibility(scrollXRef.current, w)}
          style={{ width: frameWidth, height: CARD_HEIGHT }}
          contentContainerStyle={styles.scrollContent}
        >
          {sortedDays.map((day) => {
            const active = day.date === selectedDate;
            const bySlot = mealsBySlot(day.meals);
            return (
              <Pressable
                key={day.date}
                onPress={() => {
                  onSelectDate(day.date);
                  onDayPress(day.date);
                }}
                style={({ pressed }) => [
                  styles.cardPress,
                  { width: cardWidth, height: CARD_HEIGHT },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Surface
                  style={[styles.card, active && styles.cardActive, { height: CARD_HEIGHT }]}
                  elevation={active ? 2 : 0}
                >
                  <Text variant="labelLarge" style={[styles.dayLabel, active && styles.dayLabelActive]}>
                    {formatWeekPlanDayLabel(day.date, today)}
                  </Text>
                  <Text variant="labelSmall" style={styles.dateMeta}>{day.date}</Text>
                  <View style={styles.slotList}>
                    {SLOT_ORDER.map((slot) => {
                      const meal = bySlot[slot];
                      const slotLabel = slot === 'breakfast' ? 'B' : slot === 'lunch' ? 'L' : 'D';
                      return (
                        <View key={slot} style={styles.slotRow}>
                          <Text style={[styles.slotBadge, active && styles.slotBadgeActive]}>{slotLabel}</Text>
                          <Text variant="bodySmall" style={styles.slotMeal} numberOfLines={1}>
                            {meal?.name?.trim() || '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </Surface>
              </Pressable>
            );
          })}
        </ScrollView>

        {scrollable ? (
          <>
            <View style={styles.arrowOverlayLeft} pointerEvents="box-none">
              <CarouselScrollArrow direction="left" onPress={scrollPrev} visible={showLeftArrow} />
            </View>
            <View style={styles.arrowOverlayRight} pointerEvents="box-none">
              <CarouselScrollArrow direction="right" onPress={scrollNext} visible={showRightArrow} />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: H_PAD,
  },
  heading: {
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  subheading: {
    color: '#777',
    marginBottom: 12,
  },
  carouselFrame: {
    position: 'relative',
  },
  scrollContent: {
    flexDirection: 'row',
    gap: CARD_GAP,
    alignItems: 'stretch',
    paddingRight: CARD_GAP,
  },
  cardPress: { flexShrink: 0 },
  card: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  cardActive: {
    borderColor: palette.primary,
    backgroundColor: '#F1F8F4',
  },
  dayLabel: {
    fontWeight: '800',
    color: '#333',
  },
  dayLabelActive: {
    color: palette.primary,
  },
  dateMeta: {
    color: '#999',
    marginTop: 2,
    marginBottom: 8,
    fontSize: 10,
  },
  slotList: { gap: 6 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 10,
    fontWeight: '800',
    color: '#666',
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
  },
  slotBadgeActive: {
    backgroundColor: palette.primary,
    color: '#fff',
  },
  slotMeal: {
    flex: 1,
    color: '#444',
    fontWeight: '600',
  },
  arrowOverlayLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ARROW_GUTTER,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  arrowOverlayRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ARROW_GUTTER,
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  arrowHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowHitLeft: {
    marginLeft: -ARROW_SIZE / 2,
  },
  arrowHitRight: {
    marginRight: -ARROW_SIZE / 2,
  },
  arrowHitPressed: {
    opacity: 0.85,
  },
  arrowCircle: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
