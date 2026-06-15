import React from 'react';
import { View } from 'react-native';
import { ONBOARDING_CUISINE_OPTIONS } from '../../constants/userPreferences';
import {
  AllergiesDislikesFields,
  BasicsFields,
  CuisineFields,
  DietFields,
  NotesField,
} from './PrefFields';

export interface OnboardingPreferencesFormProps {
  householdSize: number;
  onHouseholdSize: (n: number) => void;
  spiceLevel: string;
  onSpiceLevel: (v: string) => void;
  cookingSkill: string;
  onCookingSkill: (v: string) => void;
  dietaryTags: string[];
  onDietaryTags: (tags: string[]) => void;
  favCuisines: string[];
  onToggleCuisine: (c: string) => void;
  allergies: string[];
  onAllergies: (v: string[]) => void;
  dislikes: string[];
  onDislikes: (v: string[]) => void;
  newAllergy: string;
  onNewAllergy: (v: string) => void;
  newDislike: string;
  onNewDislike: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
}

export function OnboardingPreferencesForm(props: OnboardingPreferencesFormProps) {
  return (
    <View>
      <BasicsFields
        householdSize={props.householdSize}
        onHouseholdSize={props.onHouseholdSize}
        spiceLevel={props.spiceLevel}
        onSpiceLevel={props.onSpiceLevel}
        cookingSkill={props.cookingSkill}
        onCookingSkill={props.onCookingSkill}
      />
      <DietFields dietaryTags={props.dietaryTags} onDietaryTags={props.onDietaryTags} />
      <CuisineFields
        cuisines={props.favCuisines}
        options={ONBOARDING_CUISINE_OPTIONS}
        onToggle={props.onToggleCuisine}
      />
      <AllergiesDislikesFields
        allergies={props.allergies}
        onAllergies={props.onAllergies}
        dislikes={props.dislikes}
        onDislikes={props.onDislikes}
        newAllergy={props.newAllergy}
        onNewAllergy={props.onNewAllergy}
        newDislike={props.newDislike}
        onNewDislike={props.onNewDislike}
      />
      <NotesField value={props.note} onChangeText={props.onNote} />
    </View>
  );
}
