import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  COOKING_SKILLS,
  DIET_RESTRICTION_OPTIONS,
  DIET_TYPE_OPTIONS,
  SPICE_LEVELS,
  mergeDietaryTags,
  splitDietaryTags,
} from '../../constants/userPreferences';
import { preferenceStyles as s } from './preferenceStyles';

export function PrefCard({
  title,
  hint,
  children,
  style,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[s.card, style]}>
      <Text style={s.cardTitle}>{title}</Text>
      {hint ? <Text style={s.cardHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function PrefField({
  label,
  labelSuffix,
  first,
  children,
}: {
  label: string;
  labelSuffix?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={first ? s.fieldFirst : s.field}>
      <Text style={s.fieldLabel}>
        {label}
        {labelSuffix ? (
          <Text style={s.fieldLabelMuted}> {labelSuffix}</Text>
        ) : null}
      </Text>
      {children}
    </View>
  );
}

export function PrefStepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  return (
    <View style={s.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={s.stepBtn}
        accessibilityLabel="Decrease household size"
      >
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        style={s.stepBtn}
        accessibilityLabel="Increase household size"
      >
        <Text style={s.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function PrefSegment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string; emoji?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map(opt => {
        const on = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[s.segmentBtn, on && s.segmentBtnOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.segmentText, on && s.segmentTextOn]} numberOfLines={1}>
              {opt.emoji ? `${opt.emoji} ` : ''}{opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrefChips({
  options,
  selected,
  onToggle,
}: {
  options: readonly { id: string; label: string }[] | readonly string[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const normalized = options.map(o =>
    typeof o === 'string' ? { id: o, label: o } : o,
  );
  return (
    <View style={s.chipRow}>
      {normalized.map(opt => {
        const on = selected.includes(opt.id);
        return (
          <Pressable
            key={opt.id}
            onPress={() => onToggle(opt.id)}
            style={[s.chip, on && s.chipOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            {on ? <Text style={s.chipCheck}>✓</Text> : null}
            <Text style={[s.chipText, on && s.chipTextOn]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrefTagInput({
  tags,
  onRemove,
  placeholder,
  value,
  onChangeText,
  onSubmit,
  warn,
}: {
  tags: string[];
  onRemove: (tag: string) => void;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  warn?: boolean;
}) {
  return (
    <>
      {tags.length > 0 ? (
        <View style={s.tagRow}>
          {tags.map(tag => (
            <Pressable
              key={tag}
              onPress={() => onRemove(tag)}
              style={[s.tag, warn && s.tagWarn]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag}`}
            >
              <Text style={[s.tagText, warn && s.tagTextWarn]}>{tag}</Text>
              <Text style={[s.tagClose, warn && s.tagCloseWarn]}>✕</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA39C"
        style={s.textInput}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
      />
    </>
  );
}

export function SpiceLevelControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <PrefSegment options={SPICE_LEVELS} value={value} onChange={onChange} />
  );
}

export function CookingSkillControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <PrefSegment options={COOKING_SKILLS} value={value} onChange={onChange} />
  );
}

export function DietControls({
  dietaryTags,
  onDietaryTags,
}: {
  dietaryTags: string[];
  onDietaryTags: (tags: string[]) => void;
}) {
  const { dietType, restrictions } = splitDietaryTags(dietaryTags);

  const setDietType = (id: string) => {
    const next = dietType === id ? null : id;
    onDietaryTags(mergeDietaryTags(next, restrictions));
  };

  const toggleRestriction = (id: string) => {
    const next = restrictions.includes(id)
      ? restrictions.filter(r => r !== id)
      : [...restrictions, id];
    onDietaryTags(mergeDietaryTags(dietType, next));
  };

  return (
    <>
      <PrefField label="Diet type" first>
        <PrefChips
          options={DIET_TYPE_OPTIONS}
          selected={dietType ? [dietType] : []}
          onToggle={setDietType}
        />
      </PrefField>
      <PrefField label="Restrictions" labelSuffix="· optional">
        <PrefChips
          options={DIET_RESTRICTION_OPTIONS}
          selected={restrictions}
          onToggle={toggleRestriction}
        />
      </PrefField>
    </>
  );
}

export function CuisineControls({
  cuisines,
  options,
  onToggle,
}: {
  cuisines: string[];
  options: readonly string[];
  onToggle: (c: string) => void;
}) {
  return (
    <View style={s.chipRow}>
      {options.map(c => {
        const on = cuisines.includes(c);
        return (
          <Pressable
            key={c}
            onPress={() => onToggle(c)}
            style={[s.chip, on && s.chipOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            {on ? <Text style={s.chipCheck}>✓</Text> : null}
            <Text style={[s.chipText, on && s.chipTextOn]}>{c}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BasicsFields({
  householdSize,
  onHouseholdSize,
  spiceLevel,
  onSpiceLevel,
  cookingSkill,
  onCookingSkill,
}: {
  householdSize: number;
  onHouseholdSize: (n: number) => void;
  spiceLevel: string;
  onSpiceLevel: (v: string) => void;
  cookingSkill: string;
  onCookingSkill: (v: string) => void;
}) {
  return (
    <PrefCard title="Basics">
      <PrefField label="Household size" first>
        <PrefStepper value={householdSize} onChange={onHouseholdSize} />
      </PrefField>
      <PrefField label="Spice level">
        <SpiceLevelControl value={spiceLevel} onChange={onSpiceLevel} />
      </PrefField>
      <PrefField label="Cooking skill">
        <CookingSkillControl value={cookingSkill} onChange={onCookingSkill} />
      </PrefField>
    </PrefCard>
  );
}

export function DietFields({
  dietaryTags,
  onDietaryTags,
}: {
  dietaryTags: string[];
  onDietaryTags: (tags: string[]) => void;
}) {
  return (
    <PrefCard title="Diet">
      <DietControls dietaryTags={dietaryTags} onDietaryTags={onDietaryTags} />
    </PrefCard>
  );
}

export function CuisineFields({
  cuisines,
  options,
  onToggle,
}: {
  cuisines: string[];
  options: readonly string[];
  onToggle: (c: string) => void;
}) {
  return (
    <PrefCard title="Favourite cuisines">
      <View style={{ marginTop: 16 }}>
        <CuisineControls cuisines={cuisines} options={options} onToggle={onToggle} />
      </View>
    </PrefCard>
  );
}

export function AllergiesDislikesFields({
  allergies,
  onAllergies,
  dislikes,
  onDislikes,
  newAllergy,
  onNewAllergy,
  newDislike,
  onNewDislike,
}: {
  allergies: string[];
  onAllergies: (v: string[]) => void;
  dislikes: string[];
  onDislikes: (v: string[]) => void;
  newAllergy: string;
  onNewAllergy: (v: string) => void;
  newDislike: string;
  onNewDislike: (v: string) => void;
}) {
  const addAllergy = () => {
    const t = newAllergy.trim();
    if (t && !allergies.includes(t)) onAllergies([...allergies, t]);
    onNewAllergy('');
  };
  const addDislike = () => {
    const t = newDislike.trim();
    if (t && !dislikes.includes(t)) onDislikes([...dislikes, t]);
    onNewDislike('');
  };

  return (
    <PrefCard title="Allergies & dislikes">
      <Text style={[s.cardHint, { marginBottom: 0 }]}>
        <Text style={s.fieldLabelMuted}>optional</Text>
      </Text>
      <PrefField label="🚫 Allergies" labelSuffix="· hidden completely (safety)" first>
        <PrefTagInput
          tags={allergies}
          onRemove={a => onAllergies(allergies.filter(x => x !== a))}
          placeholder="e.g. peanuts, dairy, gluten"
          value={newAllergy}
          onChangeText={onNewAllergy}
          onSubmit={addAllergy}
          warn
        />
      </PrefField>
      <PrefField label="👎 Dislikes" labelSuffix="· just deprioritised">
        <PrefTagInput
          tags={dislikes}
          onRemove={d => onDislikes(dislikes.filter(x => x !== d))}
          placeholder="e.g. bitter gourd, brinjal"
          value={newDislike}
          onChangeText={onNewDislike}
          onSubmit={addDislike}
        />
      </PrefField>
    </PrefCard>
  );
}

export function NotesField({
  value,
  onChangeText,
  placeholder = 'e.g. kids like mild food, light dinners',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>
        Notes for us{' '}
        <Text style={s.fieldLabelMuted}>optional</Text>
      </Text>
      <Text style={s.cardHint}>Anything we should remember when suggesting meals?</Text>
      <View style={{ marginTop: 14 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9AA39C"
          style={s.textInput}
        />
      </View>
    </View>
  );
}
