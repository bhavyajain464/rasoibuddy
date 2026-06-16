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

export type PrefVariant = 'default' | 'onboarding';

export function PrefCard({
  title,
  hint,
  children,
  style,
  variant = 'default',
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  style?: object;
  variant?: PrefVariant;
}) {
  return (
    <View style={[s.card, variant === 'onboarding' && s.cardOnboarding, style]}>
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
  variant = 'default',
}: {
  label: string;
  labelSuffix?: string;
  first?: boolean;
  children: React.ReactNode;
  variant?: PrefVariant;
}) {
  const labelStyle = variant === 'onboarding' ? s.fieldLabelOnboarding : s.fieldLabel;
  return (
    <View style={first ? s.fieldFirst : s.field}>
      <Text style={labelStyle}>
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
  variant = 'default',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  variant?: PrefVariant;
}) {
  return (
    <View style={[s.stepper, variant === 'onboarding' && s.stepperOnboarding]}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={variant === 'onboarding' ? undefined : s.stepBtn}
        accessibilityLabel="Decrease household size"
      >
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        style={variant === 'onboarding' ? undefined : s.stepBtn}
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

export function PrefPillSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string; emoji?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={s.pillRow}>
      {options.map(opt => {
        const on = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[s.pill, on && s.pillOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.pillText, on && s.pillTextOn]} numberOfLines={1}>
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
  variant = 'default',
}: {
  options: readonly { id: string; label: string }[] | readonly string[];
  selected: string[];
  onToggle: (id: string) => void;
  variant?: PrefVariant;
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
            style={[
              s.chip,
              variant === 'onboarding' && s.chipOnboarding,
              on && s.chipOn,
            ]}
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
  variant = 'default',
}: {
  value: string;
  onChange: (v: string) => void;
  variant?: PrefVariant;
}) {
  if (variant === 'onboarding') {
    return <PrefPillSelect options={SPICE_LEVELS} value={value} onChange={onChange} />;
  }
  return <PrefSegment options={SPICE_LEVELS} value={value} onChange={onChange} />;
}

export function CookingSkillControl({
  value,
  onChange,
  variant = 'default',
}: {
  value: string;
  onChange: (v: string) => void;
  variant?: PrefVariant;
}) {
  if (variant === 'onboarding') {
    return <PrefPillSelect options={COOKING_SKILLS} value={value} onChange={onChange} />;
  }
  return <PrefSegment options={COOKING_SKILLS} value={value} onChange={onChange} />;
}

export function DietControls({
  dietaryTags,
  onDietaryTags,
  variant = 'default',
}: {
  dietaryTags: string[];
  onDietaryTags: (tags: string[]) => void;
  variant?: PrefVariant;
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
      <PrefField label="Diet type" first variant={variant}>
        <PrefChips
          options={DIET_TYPE_OPTIONS}
          selected={dietType ? [dietType] : []}
          onToggle={setDietType}
          variant={variant}
        />
      </PrefField>
      <PrefField label="Restrictions" labelSuffix="· optional" variant={variant}>
        <PrefChips
          options={DIET_RESTRICTION_OPTIONS}
          selected={restrictions}
          onToggle={toggleRestriction}
          variant={variant}
        />
      </PrefField>
    </>
  );
}

export function CuisineControls({
  cuisines,
  options,
  onToggle,
  variant = 'default',
}: {
  cuisines: string[];
  options: readonly string[];
  onToggle: (c: string) => void;
  variant?: PrefVariant;
}) {
  return (
    <View style={s.chipRow}>
      {options.map(c => {
        const on = cuisines.includes(c);
        return (
          <Pressable
            key={c}
            onPress={() => onToggle(c)}
            style={[
              s.chip,
              variant === 'onboarding' && s.chipOnboarding,
              on && s.chipOn,
            ]}
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
  variant = 'default',
}: {
  householdSize: number;
  onHouseholdSize: (n: number) => void;
  spiceLevel: string;
  onSpiceLevel: (v: string) => void;
  cookingSkill: string;
  onCookingSkill: (v: string) => void;
  variant?: PrefVariant;
}) {
  return (
    <PrefCard title="Basics" variant={variant}>
      <PrefField label="Household size" first variant={variant}>
        <PrefStepper
          value={householdSize}
          onChange={onHouseholdSize}
          variant={variant}
        />
      </PrefField>
      <PrefField label="Spice level" variant={variant}>
        <SpiceLevelControl
          value={spiceLevel}
          onChange={onSpiceLevel}
          variant={variant}
        />
      </PrefField>
      <PrefField label="Cooking skill" variant={variant}>
        <CookingSkillControl
          value={cookingSkill}
          onChange={onCookingSkill}
          variant={variant}
        />
      </PrefField>
    </PrefCard>
  );
}

export function DietFields({
  dietaryTags,
  onDietaryTags,
  variant = 'default',
}: {
  dietaryTags: string[];
  onDietaryTags: (tags: string[]) => void;
  variant?: PrefVariant;
}) {
  return (
    <PrefCard title="Diet" variant={variant}>
      <DietControls
        dietaryTags={dietaryTags}
        onDietaryTags={onDietaryTags}
        variant={variant}
      />
    </PrefCard>
  );
}

export function CuisineFields({
  cuisines,
  options,
  onToggle,
  variant = 'default',
}: {
  cuisines: string[];
  options: readonly string[];
  onToggle: (c: string) => void;
  variant?: PrefVariant;
}) {
  return (
    <PrefCard title="Favourite cuisines" variant={variant}>
      <View style={{ marginTop: 16 }}>
        <CuisineControls
          cuisines={cuisines}
          options={options}
          onToggle={onToggle}
          variant={variant}
        />
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
  variant = 'default',
}: {
  allergies: string[];
  onAllergies: (v: string[]) => void;
  dislikes: string[];
  onDislikes: (v: string[]) => void;
  newAllergy: string;
  onNewAllergy: (v: string) => void;
  newDislike: string;
  onNewDislike: (v: string) => void;
  variant?: PrefVariant;
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
    <PrefCard title="Allergies & dislikes" variant={variant}>
      {variant === 'default' ? (
        <Text style={[s.cardHint, { marginBottom: 0 }]}>
          <Text style={s.fieldLabelMuted}>optional</Text>
        </Text>
      ) : null}
      <PrefField
        label={variant === 'onboarding' ? 'Allergies' : '🚫 Allergies'}
        labelSuffix="· hidden completely (safety)"
        first
        variant={variant}
      >
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
      <PrefField
        label={variant === 'onboarding' ? 'Dislikes' : '👎 Dislikes'}
        labelSuffix="· just deprioritised"
        variant={variant}
      >
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
  variant = 'default',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  variant?: PrefVariant;
}) {
  if (variant === 'onboarding') {
    return (
      <View style={[s.card, s.cardOnboarding]}>
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
