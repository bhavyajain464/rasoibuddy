import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
} from 'react-native';
import {
  Text,
  Surface,
  TextInput,
  IconButton,
  Button,
  Menu,
  SegmentedButtons,
} from 'react-native-paper';
import { MealsHistoryDietTab } from '../components/meals/MealsHistoryDietTab';
import { WeekPlanCarousel, todayDateKey, type WeekPlanDay } from '../components/meals/WeekPlanCarousel';
import { WeekPlanDaySheet } from '../components/meals/WeekPlanDaySheet';
import {
  MealSuggestionsSheet,
  type MealCategoryResult,
  type MealTypeFilterId,
} from '../components/meals/MealSuggestionsSheet';
import { parseWeekPlanDays } from '../utils/weekPlan';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { MainTabParamList } from '../navigation/types';
import * as api from '../services/api';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { TabScreenHeader } from '../components/TabScreenHeader';

const MEALS_TABS = [
  { value: 'suggest', label: 'Meal planning', icon: 'calendar-week' },
  { value: 'history', label: 'History & diet', icon: 'history' },
] as const;

type MealsTab = (typeof MEALS_TABS)[number]['value'];

const GRID_GAP = 14;
const GRID_PAD = 18;

const CATEGORIES = [
  { id: 'daily', title: 'Daily', subtitle: 'Just a dish idea', icon: 'calendar-today' },
  { id: 'rescue_meal', title: 'Rescue', subtitle: 'Use expiring items', icon: 'alert-circle-outline' },
  { id: 'today_plan', title: 'Meal of Day', subtitle: 'Your breakfast, lunch & dinner', icon: 'star-circle' },
  { id: 'most_healthy', title: 'Healthy', subtitle: 'Nutrient-rich picks', icon: 'heart-pulse' },
  { id: 'most_tasty', title: 'Tasty', subtitle: 'Crowd pleasers', icon: 'fire' },
  { id: 'long_lasting', title: 'Meal Prep', subtitle: 'Cook now, eat later', icon: 'clock-outline' },
];

const MEAL_TYPE_FILTERS = [
  { id: 'lunch_dinner', label: 'Lunch / Dinner' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert / Sweets' },
  { id: 'all', label: 'Any meal' },
] as const;

function MealTypeDropdown({
  value,
  onChange,
}: {
  value: MealTypeFilterId;
  onChange: (id: MealTypeFilterId) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = MEAL_TYPE_FILTERS.find((o) => o.id === value) ?? MEAL_TYPE_FILTERS[0];

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Button
          mode="outlined"
          onPress={() => setOpen(true)}
          icon="chevron-down"
          style={styles.mealTypeBtn}
          contentStyle={styles.mealTypeBtnContent}
          textColor="#444"
          compact
        >
          {selected.label}
        </Button>
      }
    >
      {MEAL_TYPE_FILTERS.map((opt) => (
        <Menu.Item
          key={opt.id}
          title={opt.label}
          leadingIcon={value === opt.id ? 'check' : undefined}
          onPress={() => {
            onChange(opt.id);
            setOpen(false);
          }}
        />
      ))}
    </Menu>
  );
}

function CategoryBox({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.88 }]}>
      <Surface style={styles.gridSurface} elevation={0}>
        <View style={styles.gridIconWrap}>
          <IconButton icon={icon} iconColor="#2E7D32" size={26} style={{ margin: 0 }} />
        </View>
        <Text variant="titleSmall" style={styles.gridLabel}>{label}</Text>
        <Text variant="bodySmall" style={styles.gridSub}>{subtitle}</Text>
      </Surface>
    </Pressable>
  );
}

type MealsRouteParams = {
  openLog?: boolean;
  generateCategory?: string;
  mealType?: MealTypeFilterId;
  openWeekPlanDate?: string;
  returnToTab?: keyof MainTabParamList;
};

export function MealsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ Meals: MealsRouteParams }, 'Meals'>>();
  const { contentPaddingBottom } = useTabBarLayout();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [result, setResult] = useState<MealCategoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState<MealTypeFilterId>('lunch_dinner');
  const [mealsTab, setMealsTab] = useState<MealsTab>('suggest');
  const [openLogFromNotification, setOpenLogFromNotification] = useState(false);
  const [cookProfileReady, setCookProfileReady] = useState(false);
  const [weekPlanDays, setWeekPlanDays] = useState<WeekPlanDay[]>([]);
  const [weekPlanLoading, setWeekPlanLoading] = useState(false);
  const [weekPlanAnchor, setWeekPlanAnchor] = useState(todayDateKey());
  const [selectedPlanDate, setSelectedPlanDate] = useState(todayDateKey());
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const loadWeekPlan = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setWeekPlanLoading(true);
    try {
      const res = await api.getWeekPlan();
      const today = todayDateKey();
      if (!res?.days?.length) {
        setWeekPlanDays([]);
        setSelectedPlanDate(today);
        return;
      }
      const days = parseWeekPlanDays(res.days);
      setWeekPlanDays(days);
      setWeekPlanAnchor(res.anchor_date || today);
      setSelectedPlanDate((prev) => {
        if (days.some((day) => day.date === prev)) return prev;
        return days.find((day) => day.date === today)?.date ?? days[0]?.date ?? today;
      });
    } catch {
      setWeekPlanDays([]);
    } finally {
      if (!silent) setWeekPlanLoading(false);
    }
  }, []);

  const refreshCookProfileReady = useCallback(() => {
    void api.fetchCookProfile()
      .then((p) => setCookProfileReady(Boolean(p.configured && p.phone_number?.trim())))
      .catch(() => setCookProfileReady(false));
  }, []);

  useEffect(() => {
    if (route.params?.openLog) {
      setMealsTab('history');
      setOpenLogFromNotification(true);
      navigation.setParams({ openLog: undefined });
    }
  }, [route.params?.openLog, navigation]);

  const dismissSuggestionSheet = useCallback(() => {
    setSelectedCategory(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  const openWeekPlanDay = useCallback(async (date: string) => {
    setMealsTab('suggest');
    setSelectedPlanDate(date);
    if (!weekPlanDays.length) {
      await loadWeekPlan();
    }
    setSheetDate(date);
  }, [weekPlanDays.length, loadWeekPlan]);

  const generateForCategory = useCallback(async (
    catId: string,
    excludeDish?: string,
    mealTypeOverride?: MealTypeFilterId,
  ) => {
    const activeMealType = mealTypeOverride ?? mealTypeFilter;
    setSelectedCategory(catId);
    setLoading(true);
    setError(null);
    if (!excludeDish) {
      setResult(null);
    }
    refreshCookProfileReady();
    try {
      const res = await api.getSmartMeals(
        catId,
        userPrompt.trim() || undefined,
        excludeDish,
        activeMealType,
      );
      const categories: MealCategoryResult[] = res.categories || [];
      const match = categories.find((c) => c.id === catId) || categories[0] || null;
      setResult(match);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to generate suggestions.');
    } finally {
      setLoading(false);
    }
  }, [userPrompt, mealTypeFilter, refreshCookProfileReady]);

  const onCategoryPress = useCallback(
    (catId: string) => {
      if (catId === 'today_plan') {
        void openWeekPlanDay(todayDateKey());
        return;
      }
      void generateForCategory(catId);
    },
    [generateForCategory, openWeekPlanDay],
  );

  useEffect(() => {
    const planDate = route.params?.openWeekPlanDate;
    if (planDate) {
      navigation.setParams({ openWeekPlanDate: undefined });
      void openWeekPlanDay(planDate);
      return;
    }

    const catId = route.params?.generateCategory;
    if (!catId) return;

    if (catId === 'meal_of_day' || catId === 'today_plan') {
      navigation.setParams({ generateCategory: undefined, mealType: undefined });
      void openWeekPlanDay(todayDateKey());
      return;
    }

    const mealType = route.params?.mealType ?? 'lunch_dinner';
    setMealsTab('suggest');
    setMealTypeFilter(mealType);
    navigation.setParams({ generateCategory: undefined, mealType: undefined });

    void generateForCategory(catId, undefined, mealType);
  }, [
    route.params?.openWeekPlanDate,
    route.params?.generateCategory,
    route.params?.mealType,
    navigation,
    generateForCategory,
    openWeekPlanDay,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (mealsTab !== 'suggest') return undefined;
      void loadWeekPlan({ silent: weekPlanDays.length > 0 });
      refreshCookProfileReady();
      return undefined;
    }, [mealsTab, loadWeekPlan, refreshCookProfileReady, weekPlanDays.length]),
  );

  const sheetDay = weekPlanDays.find((d) => d.date === sheetDate) ?? null;

  const handleDayPress = useCallback((date: string) => {
    setSheetDate(date);
  }, []);

  const handleSheetDayUpdated = useCallback((updated: WeekPlanDay) => {
    setWeekPlanDays((prev) =>
      prev.map((d) => (d.date === updated.date ? updated : d)),
    );
  }, []);

  const activeCat = CATEGORIES.find((c) => c.id === selectedCategory);

  const handleRegenerate = useCallback(() => {
    if (!selectedCategory) return;
    void generateForCategory(selectedCategory, result?.meals?.[0]?.name);
  }, [selectedCategory, result, generateForCategory]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPaddingBottom() }]}
      showsVerticalScrollIndicator={false}
    >
      <TabScreenHeader
        title={mealsTab === 'history' ? 'History & diet' : 'Meal planning'}
        subtitle={
          mealsTab === 'history'
            ? 'Your meals, day by day'
            : 'Meals shaped by your pantry'
        }
      />

      <View style={styles.tabBar}>
        <SegmentedButtons
          value={mealsTab}
          onValueChange={(v) => setMealsTab(v as MealsTab)}
          buttons={MEALS_TABS.map((t) => ({
            value: t.value,
            label: t.label,
            icon: t.icon,
            style: mealsTab === t.value ? styles.tabBtnActive : styles.tabBtn,
          }))}
          style={styles.segmented}
        />
      </View>

      {mealsTab === 'history' ? (
        <MealsHistoryDietTab
          openAddOnMount={openLogFromNotification}
          onAddModalOpened={() => setOpenLogFromNotification(false)}
        />
      ) : null}

      {mealsTab === 'suggest' && (
        <>
          <WeekPlanCarousel
            days={weekPlanDays}
            selectedDate={selectedPlanDate}
            onSelectDate={setSelectedPlanDate}
            onDayPress={handleDayPress}
            loading={weekPlanLoading}
            anchorDate={weekPlanAnchor}
          />

          <WeekPlanDaySheet
            visible={sheetDate !== null}
            day={sheetDay}
            anchorDate={weekPlanAnchor}
            cookProfileReady={cookProfileReady}
            onDismiss={() => setSheetDate(null)}
            onDayUpdated={handleSheetDayUpdated}
            navigation={navigation}
          />

          <MealSuggestionsSheet
            visible={selectedCategory !== null}
            title={activeCat?.title ?? 'Meal ideas'}
            subtitle={activeCat?.subtitle}
            loading={loading}
            error={error}
            result={result}
            userPrompt={userPrompt}
            onUserPromptChange={setUserPrompt}
            mealTypeFilter={mealTypeFilter}
            onMealTypeFilterChange={setMealTypeFilter}
            onRegenerate={handleRegenerate}
            onRetry={handleRegenerate}
            onDismiss={dismissSuggestionSheet}
            cookProfileReady={cookProfileReady}
            navigation={navigation}
            onResultChange={setResult}
          />

          <Text variant="titleMedium" style={styles.sectionLabel}>More ideas</Text>

          <View style={styles.promptWrap}>
            <TextInput
              mode="outlined"
              placeholder="Any preference? e.g. italian, light..."
              value={userPrompt}
              onChangeText={setUserPrompt}
              style={styles.promptInput}
              outlineColor="#E0E0E0"
              activeOutlineColor="#2E7D32"
              outlineStyle={{ borderRadius: 14 }}
              dense
              left={<TextInput.Icon icon="message-text-outline" color="#bbb" />}
            />
            <MealTypeDropdown value={mealTypeFilter} onChange={setMealTypeFilter} />
          </View>

          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <CategoryBox
                key={cat.id}
                icon={cat.icon}
                label={cat.title}
                subtitle={cat.subtitle}
                onPress={() => onCategoryPress(cat.id)}
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  scrollContent: { paddingBottom: 24 },

  tabBar: { paddingHorizontal: GRID_PAD, paddingTop: 12, paddingBottom: 4 },
  segmented: { backgroundColor: '#fff' },
  tabBtn: { backgroundColor: '#fff' },
  tabBtnActive: { backgroundColor: '#E8F5E9' },

  promptWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID_PAD,
    paddingTop: 16,
    gap: 8,
  },
  promptInput: { flex: 1, backgroundColor: '#fff', minWidth: 0 },
  mealTypeBtn: { flexShrink: 0, backgroundColor: '#fff', borderColor: '#E0E0E0' },
  mealTypeBtnContent: { flexDirection: 'row-reverse' },

  sectionLabel: {
    fontWeight: '700',
    color: '#1A1A1A',
    paddingHorizontal: GRID_PAD,
    marginTop: 16,
    marginBottom: 10,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PAD - GRID_GAP / 2,
  },
  gridItem: {
    width: '50%',
    padding: GRID_GAP / 2,
  },
  gridSurface: {
    borderRadius: 18,
    padding: 14,
    minHeight: 120,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  gridIconWrap: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  gridLabel: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1A1A1A',
  },
  gridSub: {
    color: '#666',
    marginTop: 4,
    lineHeight: 17,
    fontSize: 12,
  },
});
