import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  PROFILE_CUISINE_OPTIONS,
  type UserPreferencesFormValues,
} from '../../constants/userPreferences';
import type { UserMemory } from '../../types';
import {
  formatCookingSkillSummary,
  formatCuisinesSummary,
  formatDietSummary,
  formatHouseholdSummary,
  formatListSummary,
  formatMemoriesSummary,
  formatSpiceSummary,
} from './preferenceFormatters';
import {
  CookingSkillControl,
  CuisineControls,
  DietControls,
  PrefField,
  PrefStepper,
  PrefTagInput,
  SpiceLevelControl,
} from './PrefFields';
import { PREF, preferenceStyles as s } from './preferenceStyles';

type RowId =
  | 'household'
  | 'spice'
  | 'cooking'
  | 'diet'
  | 'cuisines'
  | 'allergies'
  | 'dislikes'
  | 'memories';

export interface ProfilePreferencesEditorProps {
  values: UserPreferencesFormValues;
  onChange: (patch: Partial<UserPreferencesFormValues>) => void;
  memories: UserMemory[];
  onDeleteMemory: (memory: UserMemory) => void;
  onAddMemory: (content: string) => Promise<void>;
  addingMemory?: boolean;
}

function SummaryRow({
  label,
  value,
  warn,
  open,
  onPress,
  first,
}: {
  label: string;
  value: string;
  warn?: boolean;
  open: boolean;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.row, first && s.rowFirst]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, warn && s.rowValueWarn]} numberOfLines={2}>
        {value}
      </Text>
      <Text style={[s.rowChevron, open && { transform: [{ rotate: '180deg' }] }]}>⌄</Text>
    </Pressable>
  );
}

export function ProfilePreferencesEditor({
  values,
  onChange,
  memories,
  onDeleteMemory,
  onAddMemory,
  addingMemory,
}: ProfilePreferencesEditorProps) {
  const [expanded, setExpanded] = useState<RowId | null>(null);
  const [newAllergy, setNewAllergy] = useState('');
  const [newDislike, setNewDislike] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');

  const toggle = (id: RowId) =>
    setExpanded(prev => (prev === id ? null : id));

  const patch = (p: Partial<UserPreferencesFormValues>) => onChange(p);

  const addAllergy = () => {
    const t = newAllergy.trim();
    if (t && !values.allergies.includes(t)) {
      patch({ allergies: [...values.allergies, t] });
    }
    setNewAllergy('');
  };

  const addDislike = () => {
    const t = newDislike.trim();
    if (t && !values.dislikes.includes(t)) {
      patch({ dislikes: [...values.dislikes, t] });
    }
    setNewDislike('');
  };

  const submitMemory = async () => {
    const t = memoryDraft.trim();
    if (!t) return;
    await onAddMemory(t);
    setMemoryDraft('');
  };

  return (
    <View style={s.rowsCard}>
      <SummaryRow
        first
        label="Household"
        value={formatHouseholdSummary(values.householdSize)}
        open={expanded === 'household'}
        onPress={() => toggle('household')}
      />
      {expanded === 'household' ? (
        <View style={s.expand}>
          <PrefStepper
            value={values.householdSize}
            onChange={n => patch({ householdSize: n })}
          />
        </View>
      ) : null}

      <SummaryRow
        label="Spice level"
        value={formatSpiceSummary(values.spiceLevel)}
        open={expanded === 'spice'}
        onPress={() => toggle('spice')}
      />
      {expanded === 'spice' ? (
        <View style={s.expand}>
          <SpiceLevelControl
            value={values.spiceLevel}
            onChange={v => patch({ spiceLevel: v })}
          />
        </View>
      ) : null}

      <SummaryRow
        label="Cooking skill"
        value={formatCookingSkillSummary(values.cookingSkill)}
        open={expanded === 'cooking'}
        onPress={() => toggle('cooking')}
      />
      {expanded === 'cooking' ? (
        <View style={s.expand}>
          <CookingSkillControl
            value={values.cookingSkill}
            onChange={v => patch({ cookingSkill: v })}
          />
        </View>
      ) : null}

      <SummaryRow
        label="Diet"
        value={formatDietSummary(values.dietaryTags)}
        open={expanded === 'diet'}
        onPress={() => toggle('diet')}
      />
      {expanded === 'diet' ? (
        <View style={s.expand}>
          <DietControls
            dietaryTags={values.dietaryTags}
            onDietaryTags={tags => patch({ dietaryTags: tags })}
          />
        </View>
      ) : null}

      <SummaryRow
        label="Cuisines"
        value={formatCuisinesSummary(values.favCuisines)}
        open={expanded === 'cuisines'}
        onPress={() => toggle('cuisines')}
      />
      {expanded === 'cuisines' ? (
        <View style={s.expand}>
          <CuisineControls
            cuisines={values.favCuisines}
            options={PROFILE_CUISINE_OPTIONS}
            onToggle={c =>
              patch({
                favCuisines: values.favCuisines.includes(c)
                  ? values.favCuisines.filter(x => x !== c)
                  : [...values.favCuisines, c],
              })
            }
          />
        </View>
      ) : null}

      <SummaryRow
        label="Allergies"
        value={formatListSummary(values.allergies, 'None')}
        warn={values.allergies.length > 0}
        open={expanded === 'allergies'}
        onPress={() => toggle('allergies')}
      />
      {expanded === 'allergies' ? (
        <View style={s.expand}>
          <PrefTagInput
            tags={values.allergies}
            onRemove={a => patch({ allergies: values.allergies.filter(x => x !== a) })}
            placeholder="Add allergy (e.g. peanuts)"
            value={newAllergy}
            onChangeText={setNewAllergy}
            onSubmit={addAllergy}
            warn
          />
        </View>
      ) : null}

      <SummaryRow
        label="Dislikes"
        value={formatListSummary(values.dislikes, 'None')}
        open={expanded === 'dislikes'}
        onPress={() => toggle('dislikes')}
      />
      {expanded === 'dislikes' ? (
        <View style={s.expand}>
          <PrefTagInput
            tags={values.dislikes}
            onRemove={d => patch({ dislikes: values.dislikes.filter(x => x !== d) })}
            placeholder="Add dislike (e.g. bitter gourd)"
            value={newDislike}
            onChangeText={setNewDislike}
            onSubmit={addDislike}
          />
        </View>
      ) : null}

      <SummaryRow
        label="Memories"
        value={formatMemoriesSummary(memories.length)}
        open={expanded === 'memories'}
        onPress={() => toggle('memories')}
      />
      {expanded === 'memories' ? (
        <View style={s.expand}>
          <Text style={[s.cardHint, { marginBottom: 12 }]}>
            Free-form notes that nudge your suggestions.
          </Text>
          {memories.map(memory => (
            <View key={memory.id} style={s.memo}>
              <Text style={s.memoText} numberOfLines={3}>{memory.content}</Text>
              <Pressable
                onPress={() => onDeleteMemory(memory)}
                accessibilityLabel="Delete memory"
              >
                <Text style={{ fontWeight: '700', opacity: 0.55, color: PREF.muted }}>✕</Text>
              </Pressable>
            </View>
          ))}
          <PrefField label="Add a note">
            <TextInput
              value={memoryDraft}
              onChangeText={setMemoryDraft}
              placeholder="Add a note… e.g. light dinners"
              placeholderTextColor="#9AA39C"
              style={s.textInput}
              onSubmitEditing={() => void submitMemory()}
              editable={!addingMemory}
            />
          </PrefField>
          {memoryDraft.trim() ? (
            <Pressable
              onPress={() => void submitMemory()}
              style={{
                marginTop: 10,
                backgroundColor: PREF.green,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {addingMemory ? 'Adding…' : 'Add note'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
