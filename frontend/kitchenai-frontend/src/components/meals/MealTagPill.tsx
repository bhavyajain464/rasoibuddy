import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Icon } from 'react-native-paper';

export type MealTagPillVariant = 'ingredient' | 'pairs' | 'order';

type Props = {
  label: string;
  variant: MealTagPillVariant;
  selected?: boolean;
  icon?: string;
  onPress?: () => void;
  style?: ViewStyle;
};

const THEMES = {
  ingredient: {
    backgroundColor: '#E8F5E9',
    borderColor: 'transparent',
    borderWidth: 0,
    textColor: '#555',
  },
  pairs: {
    backgroundColor: '#F5F5F5',
    borderColor: 'transparent',
    borderWidth: 0,
    textColor: '#555',
  },
  pairsSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
    borderWidth: 1,
    textColor: '#333',
  },
  order: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFB74D',
    borderWidth: 1,
    textColor: '#E65100',
  },
} as const;

export function MealTagPill({
  label,
  variant,
  selected = false,
  icon,
  onPress,
  style,
}: Props) {
  const theme =
    variant === 'pairs' && selected ? THEMES.pairsSelected : THEMES[variant];
  const iconColor =
    variant === 'order' ? '#E65100' : selected ? '#2E7D32' : '#666';

  const content = (
    <>
      {icon ? <Icon source={icon} size={14} color={iconColor} /> : null}
      <Text
        style={[
          styles.label,
          { color: theme.textColor },
          selected && variant === 'pairs' && styles.labelSelected,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  const pillStyle = [
    styles.pill,
    {
      backgroundColor: theme.backgroundColor,
      borderColor: theme.borderColor,
      borderWidth: theme.borderWidth,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={({ pressed }) => [pillStyle, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={pillStyle}>{content}</View>;
}

export const mealTagPillRowStyle = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'android' ? 5 : 6,
    borderRadius: 999,
    minHeight: 28,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    ...(Platform.OS === 'android'
      ? { includeFontPadding: false, textAlignVertical: 'center' as const }
      : {}),
  },
  labelSelected: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.88,
  },
});
