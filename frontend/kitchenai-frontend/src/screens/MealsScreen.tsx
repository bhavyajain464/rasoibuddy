import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  ActivityIndicator,
  Surface,
  TextInput,
  IconButton,
  Button,
  Menu,
  SegmentedButtons,
} from 'react-native-paper';
import { MealsHistoryDietTab } from '../components/meals/MealsHistoryDietTab';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../services/api';
import { layout } from '../theme';
import { useEntitlements } from '../context/EntitlementsContext';
import { usePlanUpgrade } from '../hooks/usePlanUpgrade';
import { showUpgradeMessage } from '../utils/upgrade';
import { UpgradeRequiredError } from '../services/api';

const MEALS_TABS = [
  { value: 'suggest', label: 'Suggest meals', icon: 'lightbulb-on-outline' },
  { value: 'history', label: 'History & diet', icon: 'history' },
] as const;

type MealsTab = (typeof MEALS_TABS)[number]['value'];

const GRID_GAP = 14;
const GRID_PAD = 18;

interface SmartMeal {
  name: string;
  description: string;
  ingredients: string[];
  items_to_order?: string[];
  cooking_time_mins: number;
  difficulty: string;
  why_this_meal: string;
  nutrition_notes?: string;
  star_count?: number;
  user_starred?: boolean;
}

interface MealCategory {
  id: string;
  title: string;
  description: string;
  meals: SmartMeal[];
}

const CATEGORIES = [
  { id: 'daily', title: 'Daily', subtitle: 'Just a dish idea', icon: 'calendar-today', color: '#795548', bg: '#EFEBE9' },
  { id: 'rescue_meal', title: 'Rescue', subtitle: 'Use expiring items', icon: 'alert-circle-outline', color: '#9C27B0', bg: '#F3E5F5' },
  { id: 'meal_of_day', title: 'Meal of Day', subtitle: 'Best from inventory', icon: 'star-circle', color: '#FF9800', bg: '#FFF3E0' },
  { id: 'most_healthy', title: 'Healthy', subtitle: 'Nutrient-rich picks', icon: 'heart-pulse', color: '#4CAF50', bg: '#E8F5E9' },
  { id: 'most_tasty', title: 'Tasty', subtitle: 'Crowd pleasers', icon: 'fire', color: '#F44336', bg: '#FFEBEE' },
  { id: 'long_lasting', title: 'Meal Prep', subtitle: 'Cook now, eat later', icon: 'clock-outline', color: '#2196F3', bg: '#E3F2FD' },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4CAF50',
  medium: '#FF9800',
  hard: '#F44336',
};

const MEAL_TYPE_FILTERS = [
  { id: 'lunch_dinner', label: 'Lunch / Dinner' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert / Sweets' },
  { id: 'all', label: 'Any meal' },
] as const;

type MealTypeFilterId = (typeof MEAL_TYPE_FILTERS)[number]['id'];

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
  color,
  bg,
  locked,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle: string;
  color: string;
  bg: string;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.88 }]}>
      <Surface style={[styles.gridSurface, { backgroundColor: bg }]} elevation={1}>
        {locked ? (
          <View style={styles.premiumBadge}>
            <IconButton icon="lock" size={14} iconColor="#fff" style={{ margin: 0 }} />
            <Text variant="labelSmall" style={styles.premiumBadgeText}>Pro</Text>
          </View>
        ) : null}
        <View style={styles.gridIconWrap}>
          <IconButton icon={icon} iconColor={color} size={28} style={{ margin: 0 }} />
        </View>
        <Text variant="titleSmall" style={[styles.gridLabel, { color }]}>{label}</Text>
        <Text variant="bodySmall" style={styles.gridSub}>{subtitle}</Text>
      </Surface>
    </Pressable>
  );
}

export function MealsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [result, setResult] = useState<MealCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState<MealTypeFilterId>('lunch_dinner');
  const [inventoryCount, setInventoryCount] = useState(0);
  const [mealsTab, setMealsTab] = useState<MealsTab>('suggest');
  const [cookProfileReady, setCookProfileReady] = useState(false);
  const [starringDish, setStarringDish] = useState<string | null>(null);
  const { isMealCategoryFree, refresh: refreshEntitlements } = useEntitlements();
  const { startUpgrade } = usePlanUpgrade();

  useEffect(() => {
    api.fetchCookProfile()
      .then((p) => setCookProfileReady(Boolean(p.configured && p.phone_number?.trim())))
      .catch(() => setCookProfileReady(false));
  }, []);

  const toggleStar = useCallback(async (mealIndex: number) => {
    const meal = result?.meals?.[mealIndex];
    if (!meal?.name?.trim()) return;

    setStarringDish(meal.name);
    try {
      const res = await api.starDish(meal.name);
      setResult((prev) => {
        if (!prev) return prev;
        const meals = [...prev.meals];
        meals[mealIndex] = {
          ...meals[mealIndex],
          star_count: res.star_count,
          user_starred: res.user_starred,
        };
        return { ...prev, meals };
      });
    } catch {
      const msg = 'Could not update star.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setStarringDish(null);
    }
  }, [result]);

  const sendToCook = (meal: SmartMeal) => {
    if (!cookProfileReady) {
      const msg = 'Add your cook profile with a WhatsApp number on the Cook tab before sending messages.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Cook profile required', msg);
      navigation.navigate('Cook');
      return;
    }
    const instructions = [
      meal.description,
      `Ingredients: ${(meal.ingredients || []).join(', ')}`,
      `Cooking time: ${meal.cooking_time_mins} min`,
      meal.why_this_meal ? `Note: ${meal.why_this_meal}` : '',
    ].filter(Boolean).join('\n');
    navigation.navigate('Cook', { dishName: meal.name, instructions });
  };

  const generateForCategory = useCallback(async (catId: string, excludeDish?: string) => {
    setSelectedCategory(catId);
    setLoading(true);
    setError(null);
    if (!excludeDish) {
      setResult(null);
    }
    try {
      const res = await api.getSmartMeals(
        catId,
        userPrompt.trim() || undefined,
        excludeDish,
        mealTypeFilter,
      );
      const categories: MealCategory[] = res.categories || [];
      const match = categories.find((c) => c.id === catId) || categories[0] || null;
      setResult(match);
      setInventoryCount(res.inventory_items_used || 0);
    } catch (e: unknown) {
      if (e instanceof UpgradeRequiredError) {
        showUpgradeMessage(e.message, startUpgrade);
        setError(null);
        setSelectedCategory(null);
        void refreshEntitlements();
      } else {
        setError((e as Error).message || 'Failed to generate suggestions.');
      }
    } finally {
      setLoading(false);
    }
  }, [userPrompt, mealTypeFilter, refreshEntitlements, startUpgrade]);

  const onCategoryPress = useCallback(
    (catId: string) => {
      if (!isMealCategoryFree(catId)) {
        showUpgradeMessage(
          'Daily meal ideas are free. Rescue, Meal of Day, Healthy, Tasty, and Meal Prep need Pro.',
          startUpgrade,
        );
        return;
      }
      void generateForCategory(catId);
    },
    [isMealCategoryFree, generateForCategory, startUpgrade],
  );

  const goBack = () => {
    setSelectedCategory(null);
    setResult(null);
    setError(null);
  };

  const activeCat = CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: layout.tabBarHeight + insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 14 },
          activeCat
            ? { backgroundColor: activeCat.color }
            : mealsTab === 'history'
              ? { backgroundColor: '#7B1FA2' }
              : {},
        ]}
      >
        <View style={styles.headerContent}>
          {selectedCategory && (
            <Pressable onPress={goBack} style={styles.backRow}>
              <IconButton icon="arrow-left" iconColor="#fff" size={20} style={{ margin: 0 }} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}
          <Text variant="headlineSmall" style={styles.headerTitle}>
            {activeCat
              ? activeCat.title
              : mealsTab === 'history'
                ? 'History & diet'
                : 'Smart Meals'}
          </Text>
          <Text variant="bodyMedium" style={styles.headerSub}>
            {activeCat
              ? activeCat.subtitle
              : mealsTab === 'history'
                ? 'Log what you ate · nightly diet email'
                : 'AI-powered meal ideas from your kitchen'}
          </Text>
        </View>
      </View>

      {!selectedCategory && (
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
      )}

      {mealsTab === 'history' && !selectedCategory ? <MealsHistoryDietTab /> : null}

      {mealsTab === 'suggest' && !selectedCategory && !loading && (
        <>
          <View style={styles.promptWrap}>
            <TextInput
              mode="outlined"
              placeholder="Any preference? e.g. italian, something light..."
              value={userPrompt}
              onChangeText={setUserPrompt}
              style={styles.promptInput}
              outlineColor="#E0E0E0"
              activeOutlineColor="#FF9800"
              outlineStyle={{ borderRadius: 14 }}
              dense
              left={<TextInput.Icon icon="message-text-outline" color="#bbb" />}
            />
            <Text variant="labelMedium" style={styles.mealTypeLabel}>Meal type</Text>
            <MealTypeDropdown value={mealTypeFilter} onChange={setMealTypeFilter} />
          </View>

          <Text variant="titleMedium" style={styles.sectionLabel}>What are you looking for?</Text>

          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <CategoryBox
                key={cat.id}
                icon={cat.icon}
                label={cat.title}
                subtitle={cat.subtitle}
                color={cat.color}
                bg={cat.bg}
                locked={!isMealCategoryFree(cat.id)}
                onPress={() => onCategoryPress(cat.id)}
              />
            ))}
          </View>

        </>
      )}

      {mealsTab === 'suggest' && loading && (
        <View style={styles.loadingWrap}>
          <Surface style={styles.loadingCard} elevation={2}>
            <ActivityIndicator size="large" color={activeCat?.color || '#FF9800'} />
            <Text variant="titleSmall" style={styles.loadingText}>
              Finding {activeCat?.title || ''} ideas...
            </Text>
            <Text variant="bodySmall" style={styles.loadingSub}>
              Analyzing your inventory & preferences
            </Text>
          </Surface>
        </View>
      )}

      {mealsTab === 'suggest' && error && !loading && (
        <Surface style={styles.errorCard} elevation={1}>
          <IconButton icon="alert-circle" iconColor="#C62828" size={28} style={{ margin: 0 }} />
          <Text variant="bodyMedium" style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            <Button
              mode="contained"
              compact
              onPress={() =>
                selectedCategory &&
                generateForCategory(selectedCategory, result?.meals?.[0]?.name)
              }
              buttonColor="#C62828"
            >
              Retry
            </Button>
            <Button mode="text" compact onPress={goBack} textColor="#888">Back</Button>
          </View>
        </Surface>
      )}

      {mealsTab === 'suggest' && result && !loading && (
        <View style={styles.resultWrap}>
          <View style={styles.regenRow}>
            <TextInput
              mode="outlined"
              placeholder="Change preference..."
              value={userPrompt}
              onChangeText={setUserPrompt}
              style={styles.regenInput}
              outlineColor="#E0E0E0"
              activeOutlineColor={activeCat?.color || '#FF9800'}
              outlineStyle={{ borderRadius: 12 }}
              dense
              right={
                <TextInput.Icon
                  icon="refresh"
                  color={activeCat?.color}
                  onPress={() =>
                    selectedCategory &&
                    generateForCategory(selectedCategory, result?.meals?.[0]?.name)
                  }
                />
              }
            />
            <MealTypeDropdown value={mealTypeFilter} onChange={setMealTypeFilter} />
          </View>

          {inventoryCount > 0 && (
            <Chip icon="food-variant" compact style={styles.invChip} textStyle={{ fontSize: 12 }}>
              Using {inventoryCount} inventory items
            </Chip>
          )}

          {result.meals?.map((meal, idx) => (
            <Card key={idx} style={styles.mealCard} mode="elevated">
              <Card.Content>
                <View style={styles.mealHeader}>
                  <Text variant="titleMedium" style={styles.mealName}>{meal.name}</Text>
                  <View style={styles.mealHeaderRight}>
                    <View style={styles.starWrap}>
                      <IconButton
                        icon={meal.user_starred ? 'star' : 'star-outline'}
                        iconColor={meal.user_starred ? '#F5A623' : '#212121'}
                        size={26}
                        style={styles.starBtn}
                        onPress={() => void toggleStar(idx)}
                        disabled={starringDish === meal.name}
                        loading={starringDish === meal.name}
                        accessibilityLabel={
                          meal.user_starred ? 'Remove your star' : 'Star this dish for everyone'
                        }
                      />
                      <Text variant="labelMedium" style={styles.starCountText}>
                        {meal.star_count ?? 0}
                      </Text>
                    </View>
                    <View style={[styles.diffBadge, { backgroundColor: (DIFFICULTY_COLORS[meal.difficulty] || '#888') + '18' }]}>
                      <Text style={[styles.diffText, { color: DIFFICULTY_COLORS[meal.difficulty] || '#888' }]}>
                        {meal.difficulty}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text variant="bodyMedium" style={styles.mealDesc}>{meal.description}</Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <IconButton icon="clock-outline" size={16} iconColor="#888" style={{ margin: 0 }} />
                    <Text variant="bodySmall" style={styles.metaText}>{meal.cooking_time_mins} min</Text>
                  </View>
                </View>

                <Text variant="labelSmall" style={styles.ingLabel}>Ingredients</Text>
                <View style={styles.chipWrap}>
                  {meal.ingredients?.map((ing, i) => (
                    <Chip key={i} compact style={styles.ingChip} textStyle={styles.ingChipText}>{ing}</Chip>
                  ))}
                </View>

                {meal.items_to_order && meal.items_to_order.length > 0 && (
                  <>
                    <Text variant="labelSmall" style={styles.orderLabel}>Need to order</Text>
                    <View style={styles.chipWrap}>
                      {meal.items_to_order.map((item, i) => (
                        <Chip key={i} compact icon="cart-outline" style={styles.orderChip} textStyle={styles.orderChipText}>{item}</Chip>
                      ))}
                    </View>
                  </>
                )}

                <Surface style={styles.whyBox} elevation={0}>
                  <Text variant="labelSmall" style={styles.whyLabel}>Why this meal?</Text>
                  <Text variant="bodySmall" style={styles.whyText}>{meal.why_this_meal}</Text>
                </Surface>

                {meal.nutrition_notes ? (
                  <Text variant="bodySmall" style={styles.nutritionText}>{meal.nutrition_notes}</Text>
                ) : null}

                <Button
                  mode="contained"
                  icon="chef-hat"
                  compact
                  onPress={() => sendToCook(meal)}
                  style={styles.cookBtn}
                  buttonColor={cookProfileReady ? '#25D366' : '#9E9E9E'}
                  contentStyle={{ paddingVertical: 2 }}
                  disabled={!cookProfileReady}
                >
                  {cookProfileReady ? 'Send to Cook' : 'Set up Cook profile'}
                </Button>
              </Card.Content>
            </Card>
          ))}

          <Pressable
            onPress={() =>
              selectedCategory &&
              generateForCategory(selectedCategory, result?.meals?.[0]?.name)
            }
            style={[styles.regenBtn, { backgroundColor: activeCat?.color || '#FF9800' }]}
          >
            <IconButton icon="refresh" iconColor="#fff" size={18} style={{ margin: 0 }} />
            <Text style={styles.regenBtnText}>Regenerate Ideas</Text>
          </Pressable>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { paddingBottom: 24 },

  header: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerContent: {},
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, marginLeft: -8 },
  backText: { color: 'rgba(255,255,255,0.9)', fontWeight: '600', fontSize: 14 },
  headerTitle: { color: '#fff', fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', marginTop: 4 },

  tabBar: { paddingHorizontal: GRID_PAD, paddingTop: 14, paddingBottom: 4 },
  segmented: { backgroundColor: '#fff' },
  tabBtn: { backgroundColor: '#fff' },
  tabBtnActive: { backgroundColor: '#FFF3E0' },

  promptWrap: { paddingHorizontal: GRID_PAD, paddingTop: 16, gap: 10 },
  promptInput: { backgroundColor: '#fff' },
  mealTypeLabel: { color: '#666', marginTop: 4 },
  mealTypeBtn: { alignSelf: 'flex-start', backgroundColor: '#fff', borderColor: '#E0E0E0' },
  mealTypeBtnContent: { flexDirection: 'row-reverse' },

  sectionLabel: {
    fontWeight: '700',
    color: '#333',
    paddingHorizontal: GRID_PAD,
    marginTop: 20,
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
    borderRadius: 20,
    padding: 16,
    minHeight: 128,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  premiumBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingRight: 6,
    zIndex: 1,
  },
  premiumBadgeText: { color: '#fff', fontWeight: '700' },
  gridIconWrap: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  gridLabel: {
    fontWeight: '700',
    fontSize: 15,
  },
  gridSub: {
    color: '#666',
    marginTop: 4,
    lineHeight: 17,
    fontSize: 12,
  },

  historySection: {
    paddingHorizontal: GRID_PAD,
    marginTop: 24,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  historyHeaderText: {
    flex: 1,
  },
  historyTitle: {
    fontWeight: '700',
    color: '#333',
  },
  historySubtitle: {
    color: '#888',
    marginTop: 2,
  },
  addMealBtn: {
    borderRadius: 10,
  },
  addMealBtnContent: {
    paddingHorizontal: 4,
  },
  historyEmpty: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  historyEmptyText: {
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  historyEmptyBtn: {
    marginTop: 16,
    borderColor: '#FF9800',
  },
  addModal: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
  },
  addModalTitle: {
    fontWeight: '800',
    color: '#333',
  },
  addModalSub: {
    color: '#888',
    marginTop: 4,
    lineHeight: 18,
  },
  addModalDivider: {
    marginVertical: 14,
  },
  addModalInput: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  slotLabel: {
    color: '#666',
    marginBottom: 8,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  slotChip: {
    backgroundColor: '#F5F5F5',
  },
  slotChipSelected: {
    backgroundColor: '#FFF3E0',
  },
  slotChipText: {
    fontSize: 12,
    color: '#666',
  },
  slotChipTextSelected: {
    fontSize: 12,
    color: '#E65100',
  },
  addModalError: {
    color: '#C62828',
    marginBottom: 8,
  },
  addModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  historyBody: {
    flex: 1,
    marginRight: 8,
  },
  historyName: {
    fontWeight: '600',
    color: '#333',
  },
  historyMeta: {
    color: '#999',
    marginTop: 2,
    fontSize: 11,
  },
  sourceChip: {
    backgroundColor: '#FFF3E0',
    height: 26,
  },
  sourceChipText: {
    fontSize: 10,
    color: '#E65100',
  },

  loadingWrap: { paddingHorizontal: GRID_PAD, paddingTop: 40 },
  loadingCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 40,
    alignItems: 'center',
  },
  loadingText: { marginTop: 20, fontWeight: '600', color: '#333' },
  loadingSub: { marginTop: 6, color: '#999' },

  errorCard: {
    margin: GRID_PAD,
    borderRadius: 16,
    backgroundColor: '#FFEBEE',
    padding: 20,
    alignItems: 'center',
  },
  errorText: { color: '#C62828', marginTop: 8, textAlign: 'center' },
  errorActions: { flexDirection: 'row', gap: 12, marginTop: 16 },

  resultWrap: { paddingHorizontal: GRID_PAD, paddingTop: 4 },
  regenRow: { marginBottom: 12, gap: 10 },
  regenInput: { backgroundColor: '#fff' },
  invChip: { alignSelf: 'flex-start', marginBottom: 12, backgroundColor: '#E8F5E9' },

  mealCard: { marginBottom: 14, borderRadius: 16 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealName: { fontWeight: '700', color: '#333', flex: 1 },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  starWrap: { flexDirection: 'row', alignItems: 'center', marginRight: 4 },
  starBtn: { margin: 0 },
  starCountText: { color: '#555', fontWeight: '700', minWidth: 18, marginLeft: -6 },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  diffText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  mealDesc: { color: '#555', lineHeight: 20, marginBottom: 12 },

  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metaText: { color: '#888' },

  ingLabel: { color: '#2E7D32', fontWeight: '700', marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  ingChip: { height: 28, backgroundColor: '#E8F5E9' },
  ingChipText: { fontSize: 11, color: '#2E7D32' },

  orderLabel: { color: '#E65100', fontWeight: '700', marginBottom: 6 },
  orderChip: { height: 28, backgroundColor: '#FFF3E0', borderColor: '#FFB74D', borderWidth: 1 },
  orderChipText: { fontSize: 11, color: '#E65100' },

  whyBox: { backgroundColor: '#FFF8E1', padding: 14, borderRadius: 12, marginBottom: 8 },
  whyLabel: { color: '#F57F17', fontWeight: '700', marginBottom: 4 },
  whyText: { color: '#795548', lineHeight: 18 },

  nutritionText: { color: '#4CAF50', fontStyle: 'italic', marginBottom: 8 },

  cookBtn: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 10 },

  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  regenBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
