import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import {
  Text,
  Surface,
  Button,
  IconButton,
  TextInput,
  Checkbox,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../services/api';
import { showAppError } from '../utils/alertMessage';
import { OnboardingPreferencesForm } from '../components/preferences/OnboardingPreferencesForm';
import { PREF } from '../components/preferences/preferenceStyles';
import {
  buildAutoStaples,
  buildOnboardingInventoryItems,
  buildRegionalStaples,
  getOnboardingStapleImage,
  summarizeAutoStaples,
  type OnboardingStaple,
} from '../data/onboardingStaples';
import { BrandLogo } from '../components/BrandLogo';
import { BRAND_LOGO_ASPECT, BRAND_MOTTO } from '../constants/brand';

const INTRO_STEPS = [
  {
    title: 'How you eat',
    desc: 'Diet, spice level, and cuisines you cook at home',
  },
  {
    title: 'Stock your kitchen',
    desc: '~40 pantry staples added for you; confirm a few regional items',
  },
  {
    title: 'Meals that fit your kitchen',
    desc: 'Personalized ideas and expiry help from day one',
  },
] as const;

const STEPS = ['Start', 'Preferences', 'Your Kitchen'];
const SETUP_ESTIMATE = '~2 min';

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
  const [joiningKitchen, setJoiningKitchen] = useState(false);
  const [onboardingInviteCode, setOnboardingInviteCode] = useState('');

  // Preferences
  const [householdSize, setHouseholdSize] = useState(2);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [favCuisines, setFavCuisines] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState('medium');
  const [cookingSkill, setCookingSkill] = useState('intermediate');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState('');
  const [newDislike, setNewDislike] = useState('');
  const [onboardingNote, setOnboardingNote] = useState('');

  // Staples — ~40 auto essentials + regional toggles (no perishables)
  const onboardingPrefs = useMemo(
    () => ({ householdSize, dietaryTags, favCuisines }),
    [householdSize, dietaryTags, favCuisines],
  );
  const autoStaples = useMemo(
    () => buildAutoStaples(onboardingPrefs),
    [onboardingPrefs],
  );
  const [regionalStaples, setRegionalStaples] = useState<OnboardingStaple[]>([]);

  useEffect(() => {
    if (step !== 2) return;
    setRegionalStaples(prev => {
      const prevSelected = Object.fromEntries(prev.map(s => [s.id, s.selected]));
      return buildRegionalStaples(onboardingPrefs, prevSelected);
    });
  }, [step, onboardingPrefs]);

  const toggleRegionalStaple = (idx: number) =>
    setRegionalStaples(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));

  const toggleCuisine = (c: string) =>
    setFavCuisines(prev => prev.includes(c) ? prev.filter(t => t !== c) : [...prev, c]);

  const buildOnboardingPayload = (items: { name: string; qty: number; unit: string }[]) => ({
    household_size: householdSize,
    dietary_tags: dietaryTags,
    fav_cuisines: favCuisines,
    spice_level: spiceLevel,
    cooking_skill: cookingSkill,
    allergies,
    dislikes,
    items,
  });

  const handleComplete = async () => {
    setSaving(true);
    try {
      const items = buildOnboardingInventoryItems(autoStaples, regionalStaples);
      await api.completeOnboarding(buildOnboardingPayload(items));
      const note = onboardingNote.trim();
      if (note) {
        try {
          await api.addMemory('general', note);
        } catch {
          // onboarding already saved — note is optional
        }
      }
      onComplete();
    } catch (e: any) {
      showAppError('Failed to complete setup. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleJoinSharedKitchen = async () => {
    const code = onboardingInviteCode.trim().toUpperCase();
    if (!code) {
      showAppError('Enter an invite code to join a kitchen.');
      return;
    }
    setJoiningKitchen(true);
    try {
      await api.joinKitchen(code);
      await api.completeOnboarding(buildOnboardingPayload([]));
      onComplete();
    } catch (e) {
      console.error('Onboarding join kitchen failed:', e);
      showAppError('Could not join kitchen. Invite code may be invalid, or your current kitchen cannot be switched yet.');
    } finally {
      setJoiningKitchen(false);
    }
  };

  const regionalSelectedCount = regionalStaples.filter(s => s.selected).length;
  const totalInventoryCount = autoStaples.length + regionalSelectedCount;
  const autoSummary = summarizeAutoStaples(autoStaples);

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={[styles.progressWrap, { paddingTop: insets.top + 12 }]}>
        <View style={styles.obProg}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.obProgSeg, i <= step && styles.obProgSegOn]} />
          ))}
        </View>
        <Text style={styles.obStepLabel}>
          STEP {step + 1} OF {STEPS.length}
          {step === 0 ? ` · ${SETUP_ESTIMATE}` : ''}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (step === 1 ? 100 : 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Step 0: Intro ──────────────────────────── */}
        {step === 0 && (
          <View style={styles.stepWrap}>
            <View style={styles.introHero}>
              <BrandLogo
                width={260}
                height={260 / BRAND_LOGO_ASPECT}
                style={styles.introLogo}
              />
              <Text variant="headlineMedium" style={styles.welcomeMotto}>
                {BRAND_MOTTO}
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
          <View>
            <View style={styles.obHd}>
              <Text style={styles.obTitle}>How do you like to eat?</Text>
              <Text style={styles.obSub}>
                We'll tailor every meal idea to this. Change it anytime.
              </Text>
            </View>
            <OnboardingPreferencesForm
              householdSize={householdSize}
              onHouseholdSize={setHouseholdSize}
              spiceLevel={spiceLevel}
              onSpiceLevel={setSpiceLevel}
              cookingSkill={cookingSkill}
              onCookingSkill={setCookingSkill}
              dietaryTags={dietaryTags}
              onDietaryTags={setDietaryTags}
              favCuisines={favCuisines}
              onToggleCuisine={toggleCuisine}
              allergies={allergies}
              onAllergies={setAllergies}
              dislikes={dislikes}
              onDislikes={setDislikes}
              newAllergy={newAllergy}
              onNewAllergy={setNewAllergy}
              newDislike={newDislike}
              onNewDislike={setNewDislike}
              note={onboardingNote}
              onNote={setOnboardingNote}
            />
          </View>
        )}

        {/* ── Step 2: Your Kitchen ───────────────────── */}
        {step === 2 && (
          <View style={styles.stepWrap}>
            <Text variant="headlineSmall" style={styles.stepTitle}>Your Kitchen</Text>
            <Text variant="bodyMedium" style={styles.stepSub}>
              We add long-lasting staples automatically. Fresh items like onion & tomato come from bill scan.
            </Text>

            <Surface style={styles.joinSection} elevation={1}>
              <Text variant="titleSmall" style={styles.secLabel}>Join a shared kitchen</Text>
              <Text variant="bodySmall" style={styles.sharedHint}>
                Have an invite code? Join an existing kitchen instead.
              </Text>
              <TextInput
                dense
                mode="outlined"
                placeholder="Invite code"
                value={onboardingInviteCode}
                onChangeText={setOnboardingInviteCode}
                autoCapitalize="characters"
                style={styles.addInput}
                outlineStyle={{ borderRadius: 12 }}
                outlineColor="#E0E0E0"
              />
              <Button
                mode="outlined"
                onPress={() => void handleJoinSharedKitchen()}
                loading={joiningKitchen}
                disabled={joiningKitchen}
                style={styles.joinKitchenBtn}
              >
                Join Kitchen
              </Button>
            </Surface>

            <View style={styles.joinDividerRow}>
              <View style={styles.joinDividerLine} />
              <Text variant="labelSmall" style={styles.joinDividerLabel}>
                or start fresh
              </Text>
              <View style={styles.joinDividerLine} />
            </View>

            <Surface style={styles.autoStaplesBanner} elevation={0}>
              <Text variant="titleSmall" style={styles.autoStaplesTitle}>
                Adding {autoStaples.length} pantry staples
              </Text>
              <Text variant="bodySmall" style={styles.autoStaplesDesc}>
                {autoSummary} — scaled for {householdSize}{' '}
                {householdSize === 1 ? 'person' : 'people'}. No input needed.
              </Text>
            </Surface>

            <Surface style={styles.catSection} elevation={1}>
              <Text variant="titleSmall" style={styles.catLabel}>Regional staples</Text>
              <Text variant="bodySmall" style={styles.regionalHint}>
                Pre-selected from your cuisines — toggle off anything you do not stock.
              </Text>
              {regionalStaples.map((item, idx) => {
                const image = getOnboardingStapleImage(item.id);
                return (
                  <View key={item.id} style={styles.stapleRow}>
                    <Pressable
                      onPress={() => toggleRegionalStaple(idx)}
                      style={styles.stapleMain}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.selected }}
                    >
                      <Checkbox
                        status={item.selected ? 'checked' : 'unchecked'}
                        onPress={() => toggleRegionalStaple(idx)}
                        color="#2E7D32"
                      />
                      {image ? (
                        <Image
                          source={image}
                          style={[styles.stapleThumb, !item.selected && styles.stapleThumbMuted]}
                          accessibilityIgnoresInvertColors
                        />
                      ) : (
                        <View style={[styles.stapleThumb, styles.stapleThumbPlaceholder]} />
                      )}
                      <View style={styles.stapleInfo}>
                        <Text variant="bodyMedium" style={[styles.stapleName, !item.selected && { color: '#aaa' }]}>
                          {item.name}
                        </Text>
                        <Text variant="bodySmall" style={styles.stapleQty}>
                          {formatStapleQty(item.qty)} {item.unit}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </Surface>

            <Text variant="bodySmall" style={styles.perishableNote}>
              Onion, tomato, potato, milk, eggs & other fresh items are not pre-added — scan your grocery bill to stock those.
            </Text>

          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <Surface style={[styles.bottomBar, step === 1 && styles.bottomBarPrefs]} elevation={4}>
        {step > 0 && step !== 1 && (
          <Button mode="outlined" onPress={() => setStep(step - 1)} style={styles.backBtn}>
            Back
          </Button>
        )}
        {step === 1 ? (
          <>
            <Pressable onPress={() => setStep(2)} style={styles.obSkipBtn} accessibilityRole="button">
              <Text style={styles.obSkipText}>Skip</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep(2)}
              style={styles.obNextBtn}
              accessibilityRole="button"
            >
              <Text style={styles.obNextText}>Continue →</Text>
            </Pressable>
          </>
        ) : (
          <>
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
                {saving ? 'Setting up...' : `Finish Setup (${totalInventoryCount} items)`}
              </Button>
            )}
          </>
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  progressWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  obProg: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  obProgSeg: { height: 5, borderRadius: 3, backgroundColor: '#E2E7E3', flex: 1 },
  obProgSegOn: { backgroundColor: PREF.green },
  obStepLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: PREF.green,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  obHd: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4 },
  obTitle: { fontSize: 25, fontWeight: '800', color: PREF.ink, lineHeight: 30, marginBottom: 6 },
  obSub: { fontSize: 14, color: PREF.muted, lineHeight: 20 },
  obSkipBtn: { paddingVertical: 14, paddingHorizontal: 8 },
  obSkipText: { fontWeight: '700', color: PREF.muted, fontSize: 14 },
  obNextBtn: {
    flex: 1,
    backgroundColor: PREF.green,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: PREF.greenDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 3,
  },
  obNextText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  stepWrap: { paddingHorizontal: 20 },

  introHero: { marginTop: 12, paddingHorizontal: 4 },
  introLogo: { marginBottom: 16, alignSelf: 'center' },
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
  staplesSelectSub: { color: '#444', marginBottom: 8, fontWeight: '700' },

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
  selectAllTextMuted: { color: '#A5D6A7' },
  staplesBulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  staplesBulkCount: { color: '#666' },
  staplesBulkActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staplesBulkSep: { color: '#CCC', fontSize: 13 },
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
  stapleThumbPlaceholder: { backgroundColor: '#E8E8E8' },
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
  bottomBarPrefs: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PREF.line,
    gap: 12,
  },
  backBtn: { borderRadius: 12 },
  nextBtn: { borderRadius: 12, backgroundColor: '#2E7D32', minWidth: 140 },
  sharedHint: { color: '#666', marginBottom: 8, lineHeight: 18 },
  joinKitchenBtn: { borderRadius: 12, marginTop: 8 },
  joinDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  joinDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C5C5C5',
  },
  joinDividerLabel: {
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  joinSection: {
    backgroundColor: '#F8FAF8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D8E8D8',
  },
  autoStaplesBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C8E6C9',
  },
  autoStaplesTitle: { fontWeight: '700', color: '#1B5E20', marginBottom: 6 },
  autoStaplesDesc: { color: '#2E7D32', lineHeight: 20 },
  regionalHint: { color: '#666', marginBottom: 10, lineHeight: 18 },
  perishableNote: { color: '#888', marginTop: 4, lineHeight: 18, fontStyle: 'italic' },
});
