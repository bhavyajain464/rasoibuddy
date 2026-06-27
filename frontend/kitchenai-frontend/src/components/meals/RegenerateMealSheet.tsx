import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Surface, Text, TextInput } from 'react-native-paper';
import { BottomSheet } from '../BottomSheet';
import {
  MEAL_SUGGESTION_CATEGORIES,
  defaultMealTypeForSlot,
  type MealSuggestionCategoryId,
  type MealTypeFilterId,
} from '../../constants/mealSuggestionCategories';
import { palette } from '../../theme';

const GRID_GAP = 14;

type Props = {
  visible: boolean;
  mealSlot: string;
  loading?: boolean;
  onDismiss: () => void;
  onSelectCategory: (
    categoryId: MealSuggestionCategoryId,
    userPrompt: string,
    mealType: MealTypeFilterId,
  ) => void;
};

function CategoryBox({
  icon,
  label,
  subtitle,
  loading,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.gridItem, pressed && !loading && { opacity: 0.88 }]}
    >
      <Surface style={styles.gridSurface} elevation={0}>
        <View style={styles.gridIconWrap}>
          <IconButton icon={icon} iconColor={palette.primary} size={26} style={{ margin: 0 }} />
        </View>
        <Text variant="titleSmall" style={styles.gridLabel}>{label}</Text>
        <Text variant="bodySmall" style={styles.gridSub}>{subtitle}</Text>
        {loading ? <ActivityIndicator size="small" color={palette.primary} style={styles.gridLoader} /> : null}
      </Surface>
    </Pressable>
  );
}

export function RegenerateMealSheet({
  visible,
  mealSlot,
  loading = false,
  onDismiss,
  onSelectCategory,
}: Props) {
  const [userPrompt, setUserPrompt] = useState('');
  const [pendingCategory, setPendingCategory] = useState<MealSuggestionCategoryId | null>(null);

  useEffect(() => {
    if (!visible) {
      setUserPrompt('');
      setPendingCategory(null);
    }
  }, [visible]);

  const handleCategoryPress = (categoryId: MealSuggestionCategoryId) => {
    setPendingCategory(categoryId);
    onSelectCategory(categoryId, userPrompt.trim(), defaultMealTypeForSlot(mealSlot));
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      dismissDisabled={loading}
      title="Regenerate with AI"
      scrollable
      maxHeightRatio={0.88}
    >
      <TextInput
        mode="outlined"
        placeholder="Any preference? e.g. italian, light..."
        value={userPrompt}
        onChangeText={setUserPrompt}
        style={styles.promptInput}
        outlineColor="#E0E0E0"
        activeOutlineColor={palette.primary}
        outlineStyle={{ borderRadius: 14 }}
        dense
        disabled={loading}
        left={<TextInput.Icon icon="message-text-outline" color="#bbb" />}
      />

      <View style={styles.grid}>
        {MEAL_SUGGESTION_CATEGORIES.map((cat) => (
          <CategoryBox
            key={cat.id}
            icon={cat.icon}
            label={cat.title}
            subtitle={cat.subtitle}
            loading={loading && pendingCategory === cat.id}
            onPress={() => handleCategoryPress(cat.id)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  promptInput: {
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -GRID_GAP / 2,
    paddingBottom: 8,
  },
  gridItem: {
    width: '50%',
    padding: GRID_GAP / 2,
  },
  gridSurface: {
    borderRadius: 18,
    padding: 14,
    minHeight: 120,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  gridIconWrap: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  gridLabel: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1A1A1A',
  },
  gridSub: {
    color: '#666',
    marginTop: 4,
    lineHeight: 17,
    fontSize: 12,
  },
  gridLoader: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
});
