import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Image,
} from 'react-native';
import {
  Text,
  Surface,
  Button,
  Chip,
  IconButton,
  TextInput,
  Checkbox,
  ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../services/api';
import { showAppError } from '../utils/alertMessage';
import { DEFAULT_ONBOARDING_STAPLES, type OnboardingStaple } from '../data/onboardingStaples';
import { STAPLE_IMAGES } from '../data/stapleImages';

const ONBOARDING_MOTTO = 'Less waste. Smarter meals. Calmer evenings.';

const INTRO_STEPS = [
  {
    title: 'How you eat',
    desc: 'Diet, spice level, and cuisines you cook at home',
  },
  {
    title: 'Stock your staples',
    desc: 'Atta, dal, masala — add common items in one tap',
  },
  {
    title: 'Meals that fit your kitchen',
    desc: 'Personalized ideas and expiry help from day one',
  },
] as const;

const STEPS = ['Start', 'Preferences', 'Kitchen Staples'];
const SETUP_ESTIMATE = '~2 min';

const DIETARY_OPTIONS = [
  'vegetarian', 'vegan', 'eggetarian', 'non-veg',
  'jain', 'gluten-free', 'lactose-free', 'keto',
];
const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Bengali', 'Gujarati',
  'Punjabi', 'Chinese', 'Italian', 'Continental', 'Thai',
];
const SPICE_LEVELS = [
  { id: 'mild', label: 'Mild', emoji: '🌶' },
  { id: 'medium', label: 'Medium', emoji: '🌶🌶' },
  { id: 'spicy', label: 'Spicy', emoji: '🌶🌶🌶' },
  { id: 'extra_spicy', label: 'Extra Spicy', emoji: '🔥' },
];

interface StapleItem extends OnboardingStaple {}

function stapleQtyStep(unit: string): number {
  switch (unit) {
    case 'kg':
    case 'L':
      return 1;
    case 'g':
    case 'ml':
      return 50;
    default:
      return 1;
  }
}

function stapleQtyMin(unit: string): number {
  return stapleQtyStep(unit);
}

function formatStapleQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
}

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Preferences
  const [householdSize, setHouseholdSize] = useState(2);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [favCuisines, setFavCuisines] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState('medium');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState('');

  // Staples
  const [staples, setStaples] = useState<StapleItem[]>(() =>
    DEFAULT_ONBOARDING_STAPLES.map(s => ({ ...s })),
  );

  const toggleDietary = (tag: string) =>
    setDietaryTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  const toggleCuisine = (c: string) =>
    setFavCuisines(prev => prev.includes(c) ? prev.filter(t => t !== c) : [...prev, c]);
  const toggleStaple = (idx: number) =>
    setStaples(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));

  const selectAllCategory = (cat: string, select: boolean) =>
    setStaples(prev => prev.map(s => s.category === cat ? { ...s, selected: select } : s));

  const adjustStapleQty = (idx: number, direction: 1 | -1) => {
    setStaples(prev =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const step = stapleQtyStep(s.unit);
        const min = stapleQtyMin(s.unit);
        const next = Math.max(min, s.qty + direction * step);
        return { ...s, qty: next };
      }),
    );
  };

  const addAllergy = () => {
    const trimmed = newAllergy.trim();
    if (trimmed && !allergies.includes(trimmed)) setAllergies(prev => [...prev, trimmed]);
    setNewAllergy('');
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const selectedItems = staples.filter(s => s.selected).map(s => ({
        name: s.name, qty: s.qty, unit: s.unit,
      }));
      await api.completeOnboarding({
        household_size: householdSize,
        dietary_tags: dietaryTags,
        fav_cuisines: favCuisines,
        spice_level: spiceLevel,
        cooking_skill: 'intermediate',
        allergies,
        dislikes: [],
        items: selectedItems,
      });
      onComplete();
    } catch (e: any) {
      showAppError('Failed to complete setup. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const categories = [...new Set(staples.map(s => s.category))];
  const selectedCount = staples.filter(s => s.selected).length;

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={[styles.progressWrap, { paddingTop: insets.top + 12 }]}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          Step {step + 1} of {STEPS.length}
          {step === 0 ? ` · ${SETUP_ESTIMATE}` : ''}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 0: Intro ──────────────────────────── */}
        {step === 0 && (
          <View style={styles.stepWrap}>
            <View style={styles.introHero}>
              <Text variant="headlineMedium" style={styles.welcomeMotto}>
                {ONBOARDING_MOTTO}
              </Text>
              <Text variant="bodyLarge" style={styles.introLead}>
                Let's set up your kitchen in 2 quick steps.
              </Text>
              <Text variant="bodyMedium" style={styles.introNote}>
                We'll personalize meals and stock essentials — no bill scan yet.
              </Text>
            </View>

            <View style={styles.featureList}>
              {INTRO_STEPS.map((item, i) => (
                <View key={item.title} style={styles.featureRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{i + 1}</Text>
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <Text style={styles.featureDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Step 1: Preferences ────────────────────── */}
        {step === 1 && (
          <View style={styles.stepWrap}>
            <Text variant="headlineSmall" style={styles.stepTitle}>Your Preferences</Text>
            <Text variant="bodyMedium" style={styles.stepSub}>This helps us suggest the right meals</Text>

            <Surface style={styles.section} elevation={1}>
              <Text variant="titleSmall" style={styles.secLabel}>Household Size</Text>
              <View style={styles.counterRow}>
                <Pressable onPress={() => setHouseholdSize(Math.max(1, householdSize - 1))} style={styles.counterBtn}>
                  <IconButton icon="minus" size={18} iconColor="#666" style={{ margin: 0 }} />
                </Pressable>
                <Text variant="headlineMedium" style={styles.counterVal}>{householdSize}</Text>
                <Pressable onPress={() => setHouseholdSize(householdSize + 1)} style={styles.counterBtn}>
                  <IconButton icon="plus" size={18} iconColor="#666" style={{ margin: 0 }} />
                </Pressable>
              </View>
            </Surface>

            <Surface style={styles.section} elevation={1}>
              <Text variant="titleSmall" style={styles.secLabel}>Dietary Preference</Text>
              <View style={styles.chipRow}>
                {DIETARY_OPTIONS.map(tag => (
                  <Chip
                    key={tag}
                    selected={dietaryTags.includes(tag)}
                    onPress={() => toggleDietary(tag)}
                    style={[styles.chip, dietaryTags.includes(tag) && styles.chipActive]}
                    textStyle={dietaryTags.includes(tag) ? { color: '#fff' } : { color: '#555' }}
                    showSelectedCheck={false}
                  >
                    {tag}
                  </Chip>
                ))}
              </View>
            </Surface>

            <Surface style={styles.section} elevation={1}>
              <Text variant="titleSmall" style={styles.secLabel}>Spice Level</Text>
              <View style={styles.chipRow}>
                {SPICE_LEVELS.map(s => (
                  <Pressable key={s.id} onPress={() => setSpiceLevel(s.id)}>
                    <Surface style={[styles.spicePill, spiceLevel === s.id && styles.spicePillActive]} elevation={0}>
                      <Text style={styles.spiceEmoji}>{s.emoji}</Text>
                      <Text style={[styles.spiceText, spiceLevel === s.id && { color: '#fff' }]}>{s.label}</Text>
                    </Surface>
                  </Pressable>
                ))}
              </View>
            </Surface>

            <Surface style={styles.section} elevation={1}>
              <Text variant="titleSmall" style={styles.secLabel}>Favorite Cuisines</Text>
              <View style={styles.chipRow}>
                {CUISINE_OPTIONS.map(c => (
                  <Chip
                    key={c}
                    selected={favCuisines.includes(c)}
                    onPress={() => toggleCuisine(c)}
                    style={[styles.chip, favCuisines.includes(c) && styles.chipActive]}
                    textStyle={favCuisines.includes(c) ? { color: '#fff' } : { color: '#555' }}
                    showSelectedCheck={false}
                  >
                    {c}
                  </Chip>
                ))}
              </View>
            </Surface>

            <Surface style={styles.section} elevation={1}>
              <Text variant="titleSmall" style={styles.secLabel}>Allergies (optional)</Text>
              <View style={styles.chipRow}>
                {allergies.map(a => (
                  <Chip key={a} onClose={() => setAllergies(prev => prev.filter(x => x !== a))} style={styles.grayChip}>
                    {a}
                  </Chip>
                ))}
              </View>
              <View style={styles.addRow}>
                <TextInput
                  dense mode="outlined" placeholder="e.g. peanuts, shellfish"
                  value={newAllergy} onChangeText={setNewAllergy} style={styles.addInput}
                  outlineStyle={{ borderRadius: 12 }} outlineColor="#E0E0E0"
                  onSubmitEditing={addAllergy}
                />
                <IconButton icon="plus-circle" iconColor="#888" size={28} onPress={addAllergy} style={{ margin: 0 }} />
              </View>
            </Surface>
          </View>
        )}

        {/* ── Step 2: Kitchen Staples ────────────────── */}
        {step === 2 && (
          <View style={styles.stepWrap}>
            <Text variant="headlineSmall" style={styles.stepTitle}>Kitchen Staples</Text>
            <Text variant="bodyMedium" style={styles.stepSub}>
              Select items already in your kitchen
            </Text>

            {categories.map(cat => {
              const catItems = staples.filter(s => s.category === cat);
              const allSelected = catItems.every(s => s.selected);
              return (
                <Surface key={cat} style={styles.catSection} elevation={1}>
                  <View style={styles.catHeader}>
                    <Text variant="titleSmall" style={styles.catLabel}>{cat}</Text>
                    <Pressable onPress={() => selectAllCategory(cat, !allSelected)}>
                      <Text style={styles.selectAllText}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
                    </Pressable>
                  </View>
                  {catItems.map((item) => {
                    const idx = staples.indexOf(item);
                    return (
                      <View key={idx} style={styles.stapleRow}>
                        <Pressable
                          onPress={() => toggleStaple(idx)}
                          style={styles.stapleMain}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: item.selected }}
                        >
                          <Checkbox
                            status={item.selected ? 'checked' : 'unchecked'}
                            onPress={() => toggleStaple(idx)}
                            color="#2E7D32"
                          />
                          <Image
                            source={STAPLE_IMAGES[item.id]}
                            style={[styles.stapleThumb, !item.selected && styles.stapleThumbMuted]}
                            accessibilityIgnoresInvertColors
                          />
                          <View style={styles.stapleInfo}>
                            <Text variant="bodyMedium" style={[styles.stapleName, !item.selected && { color: '#aaa' }]}>
                              {item.name}
                            </Text>
                            {!item.selected && (
                              <Text variant="bodySmall" style={styles.stapleQty}>
                                {formatStapleQty(item.qty)} {item.unit}
                              </Text>
                            )}
                          </View>
                        </Pressable>
                        {item.selected ? (
                          <View style={styles.stapleQtyControls}>
                            <Pressable
                              onPress={() => adjustStapleQty(idx, -1)}
                              style={styles.stapleQtyBtn}
                              accessibilityLabel={`Decrease ${item.name}`}
                            >
                              <IconButton icon="minus" size={16} iconColor="#666" style={{ margin: 0 }} />
                            </Pressable>
                            <Text variant="bodySmall" style={styles.stapleQtyActive}>
                              {formatStapleQty(item.qty)} {item.unit}
                            </Text>
                            <Pressable
                              onPress={() => adjustStapleQty(idx, 1)}
                              style={styles.stapleQtyBtn}
                              accessibilityLabel={`Increase ${item.name}`}
                            >
                              <IconButton icon="plus" size={16} iconColor="#666" style={{ margin: 0 }} />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </Surface>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <Surface style={styles.bottomBar} elevation={4}>
        {step > 0 && (
          <Button mode="outlined" onPress={() => setStep(step - 1)} style={styles.backBtn}>
            Back
          </Button>
        )}
        <View style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <Button
            mode="contained"
            onPress={() => setStep(step + 1)}
            style={styles.nextBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            {step === 0 ? 'Set up my kitchen' : 'Next'}
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleComplete}
            loading={saving}
            disabled={saving}
            style={styles.nextBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            {saving ? 'Setting up...' : `Finish Setup (${selectedCount} items)`}
          </Button>
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  progressWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  progressBar: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: '#2E7D32', borderRadius: 3 },
  progressText: { color: '#999', fontSize: 12, marginTop: 6, textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  stepWrap: { paddingHorizontal: 20 },

  introHero: { marginTop: 12, paddingHorizontal: 4 },
  welcomeMotto: { fontWeight: '800', color: '#1B5E20', textAlign: 'left', lineHeight: 34 },
  introLead: { color: '#333', marginTop: 16, fontWeight: '600', lineHeight: 24 },
  introNote: { color: '#777', marginTop: 8, lineHeight: 22 },
  featureList: { marginTop: 28, gap: 18 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  featureCopy: { flex: 1 },
  featureTitle: { color: '#333', fontSize: 16, fontWeight: '700' },
  featureDesc: { color: '#777', fontSize: 14, marginTop: 3, lineHeight: 20 },

  // Steps
  stepTitle: { fontWeight: '800', color: '#333', marginTop: 12 },
  stepSub: { color: '#888', marginTop: 4, marginBottom: 16 },

  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  secLabel: { fontWeight: '700', color: '#333', marginBottom: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#F5F5F5' },
  chipActive: { backgroundColor: '#2E7D32' },
  grayChip: { backgroundColor: '#F5F5F5' },

  spicePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F5F5', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  spicePillActive: { backgroundColor: '#2E7D32' },
  spiceEmoji: { fontSize: 14 },
  spiceText: { fontSize: 13, color: '#666', fontWeight: '600' },

  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  counterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  counterVal: { fontWeight: '800', minWidth: 40, textAlign: 'center', color: '#333' },

  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  addInput: { flex: 1, marginRight: 4, backgroundColor: '#fff' },

  // Staples
  catSection: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  catLabel: { fontWeight: '700', color: '#333' },
  selectAllText: { color: '#2E7D32', fontWeight: '600', fontSize: 13 },
  stapleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  stapleMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  stapleThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginLeft: 2,
    backgroundColor: '#F3F4F2',
  },
  stapleThumbMuted: { opacity: 0.45 },
  stapleInfo: { flex: 1, marginLeft: 10 },
  stapleName: { fontWeight: '500', color: '#333' },
  stapleQty: { color: '#999', marginTop: 1 },
  stapleQtyControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stapleQtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stapleQtyActive: { color: '#2E7D32', fontWeight: '700', minWidth: 56, textAlign: 'center' },

  // Bottom
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderTopWidth: 0,
  },
  backBtn: { borderRadius: 12 },
  nextBtn: { borderRadius: 12, backgroundColor: '#2E7D32', minWidth: 140 },
});
