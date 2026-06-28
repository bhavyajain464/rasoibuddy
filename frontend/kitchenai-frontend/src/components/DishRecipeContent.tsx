import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import type { DishRecipe } from '../types';
import { palette } from '../theme';

function formatMinutes(mins?: number) {
  if (!mins || mins <= 0) return null;
  return `${mins} min`;
}

type Props = {
  loading: boolean;
  recipe: DishRecipe | null;
  dishName?: string;
  scrollStyle?: object;
  contentStyle?: object;
};

export function DishRecipeContent({
  loading,
  recipe,
  dishName,
  scrollStyle,
  contentStyle,
}: Props) {
  if (loading) {
    return <ActivityIndicator color={palette.primary} style={styles.loader} />;
  }

  if (!recipe) {
    return (
      <Text variant="bodyMedium" style={styles.muted}>
        No recipe available for {dishName?.trim() || 'this dish'} yet.
      </Text>
    );
  }

  const prep = formatMinutes(recipe.prep_time_minutes);
  const cook = formatMinutes(recipe.cook_time_minutes);
  const timeLabel = [prep ? `Prep ${prep}` : null, cook ? `Cook ${cook}` : null].filter(Boolean).join(' · ');

  return (
    <ScrollView style={[styles.scroll, scrollStyle]} contentContainerStyle={[styles.content, contentStyle]}>
      {recipe.description?.trim() ? (
        <Text variant="bodyMedium" style={styles.description}>{recipe.description}</Text>
      ) : null}

      {timeLabel || recipe.yield ? (
        <View style={styles.metaRow}>
          {timeLabel ? (
            <Text variant="labelMedium" style={styles.meta}>{timeLabel}</Text>
          ) : null}
          {recipe.yield ? (
            <Text variant="labelMedium" style={styles.meta}>Serves {recipe.yield}</Text>
          ) : null}
        </View>
      ) : null}

      {recipe.ingredients.length > 0 ? (
        <>
          <Text variant="titleSmall" style={styles.section}>Ingredients</Text>
          {recipe.ingredients.map((item, index) => (
            <Text key={`${index}-${item}`} variant="bodyMedium" style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </>
      ) : null}

      {recipe.instructions.length > 0 ? (
        <>
          <Text variant="titleSmall" style={styles.section}>Steps</Text>
          {recipe.instructions.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <Text variant="labelLarge" style={styles.stepNum}>{index + 1}</Text>
              <Text variant="bodyMedium" style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: 24 },
  muted: { color: palette.textSecondary, marginVertical: 12 },
  scroll: { maxHeight: 520 },
  content: { paddingBottom: 16, gap: 4 },
  description: { color: palette.textSecondary, marginBottom: 8 },
  metaRow: { gap: 4, marginBottom: 12 },
  meta: { color: palette.primary },
  section: { marginTop: 12, marginBottom: 6, fontWeight: '600' },
  bullet: { marginBottom: 4, lineHeight: 22 },
  stepRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stepNum: { width: 22, color: palette.primary, fontWeight: '700' },
  stepText: { flex: 1, lineHeight: 22 },
});
