import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  IconButton,
  Menu,
  Text,
  TextInput,
} from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import { showAppError } from '../../utils/alertMessage';
import * as api from '../../services/api';

export interface SmartMeal {
  meal_slot?: string;
  name: string;
  description: string;
  ingredients: string[];
  items_to_order?: string[];
  cooking_time_mins: number;
  difficulty: string;
  why_this_meal: string;
  pairs_with?: string[];
  nutrition_notes?: string;
  star_count?: number;
  user_starred?: boolean;
}

export interface MealCategoryResult {
  id: string;
  title: string;
  description: string;
  meals: SmartMeal[];
}

const MEAL_TYPE_FILTERS = [
  { id: 'lunch_dinner', label: 'Lunch / Dinner' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert / Sweets' },
  { id: 'all', label: 'Any meal' },
] as const;

export type MealTypeFilterId = (typeof MEAL_TYPE_FILTERS)[number]['id'];

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#388E3C',
  medium: '#689F38',
  hard: '#1B5E20',
};

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

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

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  loading: boolean;
  error: string | null;
  result: MealCategoryResult | null;
  userPrompt: string;
  onUserPromptChange: (value: string) => void;
  mealTypeFilter: MealTypeFilterId;
  onMealTypeFilterChange: (id: MealTypeFilterId) => void;
  onRegenerate: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  cookProfileReady: boolean;
  navigation: { navigate: (screen: string, params?: object) => void };
  onResultChange: (result: MealCategoryResult | null) => void;
};

export function MealSuggestionsSheet({
  visible,
  title,
  subtitle,
  loading,
  error,
  result,
  userPrompt,
  onUserPromptChange,
  mealTypeFilter,
  onMealTypeFilterChange,
  onRegenerate,
  onRetry,
  onDismiss,
  cookProfileReady,
  navigation,
  onResultChange,
}: Props) {
  const [selectedPairsByMeal, setSelectedPairsByMeal] = useState<Record<number, string[]>>({});
  const [starringDish, setStarringDish] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPairsByMeal({});
  }, [result]);

  const togglePairSelection = (mealIndex: number, item: string) => {
    setSelectedPairsByMeal((prev) => {
      const current = new Set(prev[mealIndex] ?? []);
      if (current.has(item)) {
        current.delete(item);
      } else {
        current.add(item);
      }
      return { ...prev, [mealIndex]: Array.from(current) };
    });
  };

  const cookSendItemCount = (mealIndex: number) =>
    1 + (selectedPairsByMeal[mealIndex]?.length ?? 0);

  const toggleStar = async (mealIndex: number) => {
    const meal = result?.meals?.[mealIndex];
    if (!meal?.name?.trim()) return;

    setStarringDish(meal.name);
    try {
      const res = await api.starDish(meal.name);
      if (!result) return;
      const meals = [...result.meals];
      meals[mealIndex] = {
        ...meals[mealIndex],
        star_count: res.star_count,
        user_starred: res.user_starred,
      };
      onResultChange({ ...result, meals });
    } catch {
      showAppError('Could not update star.');
    } finally {
      setStarringDish(null);
    }
  };

  const sendToCook = (meal: SmartMeal, mealIndex: number) => {
    const pairs = selectedPairsByMeal[mealIndex] ?? [];
    onDismiss();
    navigation.navigate('Cook', { dishItems: [meal.name, ...pairs] });
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      subtitle={subtitle}
      scrollable
      maxHeightRatio={0.92}
      dismissDisabled={loading}
    >
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text variant="titleSmall" style={styles.loadingText}>
            Finding {title} ideas...
          </Text>
          <Text variant="bodySmall" style={styles.loadingSub}>
            Analyzing your inventory & preferences
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <IconButton icon="alert-circle" iconColor="#C62828" size={32} style={{ margin: 0 }} />
          <Text variant="bodyMedium" style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            <Button mode="contained" compact onPress={onRetry} buttonColor="#C62828">
              Retry
            </Button>
          </View>
        </View>
      ) : result ? (
        <>
          <View style={styles.regenRow}>
            <TextInput
              mode="outlined"
              placeholder="Change preference..."
              value={userPrompt}
              onChangeText={onUserPromptChange}
              style={styles.regenInput}
              outlineColor="#E0E0E0"
              activeOutlineColor="#2E7D32"
              outlineStyle={{ borderRadius: 12 }}
              dense
            />
          </View>

          <View style={styles.filterRow}>
            <MealTypeDropdown value={mealTypeFilter} onChange={onMealTypeFilterChange} />
            <Pressable
              onPress={onRegenerate}
              style={({ pressed }) => [styles.regenBtn, pressed && { opacity: 0.88 }]}
            >
              <IconButton icon="refresh" iconColor="#fff" size={18} style={{ margin: 0 }} />
              <Text style={styles.regenBtnText}>Regenerate Ideas</Text>
            </Pressable>
          </View>

          {result.meals?.map((meal, idx) => (
            <Card key={idx} style={styles.mealCard} mode="elevated">
              <Card.Content>
                {meal.meal_slot ? (
                  <Text variant="labelLarge" style={styles.mealSlotLabel}>
                    {SLOT_LABELS[meal.meal_slot] ?? meal.meal_slot}
                  </Text>
                ) : null}
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
                    <View
                      style={[
                        styles.diffBadge,
                        { backgroundColor: (DIFFICULTY_COLORS[meal.difficulty] || '#888') + '18' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.diffText,
                          { color: DIFFICULTY_COLORS[meal.difficulty] || '#888' },
                        ]}
                      >
                        {meal.difficulty}
                      </Text>
                    </View>
                  </View>
                </View>

                {meal.description?.trim() &&
                meal.description.trim() !==
                  'A home-style option from your personalized shortlist.' ? (
                  <Text variant="bodyMedium" style={styles.mealDesc}>{meal.description}</Text>
                ) : null}

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <IconButton icon="clock-outline" size={16} iconColor="#888" style={{ margin: 0 }} />
                    <Text variant="bodySmall" style={styles.metaText}>{meal.cooking_time_mins} min</Text>
                  </View>
                </View>

                <Text variant="labelSmall" style={styles.ingLabel}>Ingredients</Text>
                <View style={styles.chipWrap}>
                  {meal.ingredients?.map((ing, i) => (
                    <Chip key={i} compact style={styles.ingChip} textStyle={styles.ingChipText}>
                      {ing}
                    </Chip>
                  ))}
                </View>

                {meal.pairs_with && meal.pairs_with.length > 0 ? (
                  <>
                    <Text variant="labelSmall" style={styles.pairsLabel}>
                      Pairs well with — tap to include with message
                    </Text>
                    <View style={styles.chipWrap}>
                      {meal.pairs_with.map((item, i) => {
                        const pairSelected = (selectedPairsByMeal[idx] ?? []).includes(item);
                        return (
                          <Chip
                            key={i}
                            compact
                            icon={pairSelected ? 'check' : 'silverware-fork-knife'}
                            selected={pairSelected}
                            showSelectedOverlay
                            onPress={() => togglePairSelection(idx, item)}
                            style={[styles.pairsChip, pairSelected && styles.pairsChipSelected]}
                            textStyle={[
                              styles.pairsChipText,
                              pairSelected && styles.pairsChipTextSelected,
                            ]}
                          >
                            {item}
                          </Chip>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                {meal.items_to_order && meal.items_to_order.length > 0 ? (
                  <>
                    <Text variant="labelSmall" style={styles.orderLabel}>Need to order</Text>
                    <View style={styles.chipWrap}>
                      {meal.items_to_order.map((item, i) => (
                        <Chip
                          key={i}
                          compact
                          icon="cart-outline"
                          style={styles.orderChip}
                          textStyle={styles.orderChipText}
                        >
                          {item}
                        </Chip>
                      ))}
                    </View>
                  </>
                ) : null}

                {meal.nutrition_notes ? (
                  <Text variant="bodySmall" style={styles.nutritionText}>{meal.nutrition_notes}</Text>
                ) : null}

                <Button
                  mode="contained"
                  icon="chef-hat"
                  compact
                  onPress={() => sendToCook(meal, idx)}
                  style={styles.cookBtn}
                  buttonColor={cookProfileReady ? '#25D366' : '#9E9E9E'}
                  contentStyle={{ paddingVertical: 2 }}
                  disabled={!cookProfileReady}
                >
                  {cookProfileReady
                    ? cookSendItemCount(idx) > 1
                      ? `Send to Cook (${cookSendItemCount(idx)} items)`
                      : 'Send to Cook'
                    : 'Set up Cook profile'}
                </Button>
              </Card.Content>
            </Card>
          ))}
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
  loadingText: { marginTop: 16, fontWeight: '600', color: '#333' },
  loadingSub: { marginTop: 6, color: '#999', textAlign: 'center' },
  errorText: { color: '#C62828', marginTop: 8, textAlign: 'center' },
  errorActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  mealTypeBtn: { flexShrink: 0, backgroundColor: '#fff', borderColor: '#E0E0E0' },
  mealTypeBtnContent: { flexDirection: 'row-reverse' },
  regenRow: { marginBottom: 10 },
  regenInput: { backgroundColor: '#fff' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexShrink: 1,
  },
  regenBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mealCard: { marginBottom: 14, borderRadius: 16 },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealSlotLabel: { color: '#2E7D32', fontWeight: '700', marginBottom: 8 },
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
  ingLabel: { color: '#333', fontWeight: '700', marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  ingChip: { height: 28, backgroundColor: '#E8F5E9' },
  ingChipText: { fontSize: 11, color: '#555' },
  pairsLabel: { color: '#333', fontWeight: '700', marginBottom: 6 },
  pairsChip: { height: 30, backgroundColor: '#F5F5F5' },
  pairsChipSelected: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#2E7D32' },
  pairsChipText: { fontSize: 11, color: '#555' },
  pairsChipTextSelected: { color: '#333', fontWeight: '600' },
  orderLabel: { color: '#E65100', fontWeight: '700', marginBottom: 6 },
  orderChip: { height: 28, backgroundColor: '#FFF3E0', borderColor: '#FFB74D', borderWidth: 1 },
  orderChipText: { fontSize: 11, color: '#E65100' },
  nutritionText: { color: '#666', fontStyle: 'italic', marginBottom: 8 },
  cookBtn: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 10 },
});
