import {
  PERISHABLE_STAPLE_IDS,
  buildAutoStaples,
  buildOnboardingInventoryItems,
  buildRegionalStaples,
} from './onboardingStaples';

describe('onboardingStaples', () => {
  const basePrefs = { householdSize: 2, dietaryTags: [] as string[], favCuisines: [] as string[] };

  it('auto-adds ~40 bulk staples with zero user input', () => {
    const auto = buildAutoStaples(basePrefs);
    expect(auto.length).toBeGreaterThanOrEqual(38);
    expect(auto.every(s => s.group === 'auto' && s.selected)).toBe(true);
    expect(auto.find(s => s.id === 'turmeric_powder')).toBeTruthy();
    expect(auto.find(s => s.id === 'toor_dal')).toBeTruthy();
    expect(auto.find(s => s.id === 'poha')).toBeTruthy();
  });

  it('never seeds perishable staples', () => {
    const auto = buildAutoStaples(basePrefs);
    const regional = buildRegionalStaples(basePrefs);
    const seededIds = new Set([...auto, ...regional].map(s => s.id));
    for (const id of PERISHABLE_STAPLE_IDS) {
      expect(seededIds.has(id)).toBe(false);
    }
  });

  it('pre-selects regional staples from cuisine prefs', () => {
    const south = buildRegionalStaples({ ...basePrefs, favCuisines: ['South Indian'] });
    expect(south.find(s => s.id === 'curry_leaves')?.selected).toBe(true);
    expect(south.find(s => s.id === 'sambar_powder')?.selected).toBe(true);
    expect(south.find(s => s.id === 'rasam_powder')?.selected).toBe(true);
    expect(south.find(s => s.id === 'mustard_oil')?.selected).toBe(false);
  });

  it('respects dietary filters on auto staples', () => {
    const veganAuto = buildAutoStaples({ ...basePrefs, dietaryTags: ['vegan'] });
    expect(veganAuto.some(s => s.id === 'ghee')).toBe(false);

    const gfAuto = buildAutoStaples({ ...basePrefs, dietaryTags: ['gluten-free'] });
    expect(gfAuto.some(s => s.id === 'wheat_flour')).toBe(false);
    expect(gfAuto.some(s => s.id === 'all_purpose_flour')).toBe(false);
    expect(gfAuto.some(s => s.id === 'semolina')).toBe(false);
  });

  it('merges auto and selected regional items for onboarding payload', () => {
    const auto = buildAutoStaples(basePrefs);
    const regional = buildRegionalStaples({ ...basePrefs, favCuisines: ['South Indian'] });
    const items = buildOnboardingInventoryItems(auto, regional);
    expect(items.length).toBeGreaterThan(auto.length);
  });
});
