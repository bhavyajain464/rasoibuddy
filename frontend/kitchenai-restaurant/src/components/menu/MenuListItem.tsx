import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Icon, IconButton, Menu, Text } from 'react-native-paper';
import { MenuItem, RecipeIngredient } from '../../types';
import { palette } from '../../theme';

export type MenuMenuAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  item: MenuItem;
  ingredients: RecipeIngredient[];
  menuActions: MenuMenuAction[];
  onPress?: () => void;
  style?: ViewStyle;
};

function formatIngredientLine(ing: RecipeIngredient): string {
  const qty = ing.qty % 1 === 0 ? String(Math.round(ing.qty)) : ing.qty.toFixed(2);
  return `${ing.ingredient_name} ${qty} ${ing.unit}`;
}

function ingredientsPreview(ings: RecipeIngredient[]): string {
  if (ings.length === 0) return 'No ingredients linked';
  return ings.map(formatIngredientLine).join(' · ');
}

export function MenuListItem({ item, ingredients, menuActions, onPress, style }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const showMenuButton = Platform.OS !== 'web' || hovered || menuOpen;
  const imageUri = item.image_url?.trim() ?? '';

  useEffect(() => {
    setImageError(false);
  }, [imageUri, item.menu_item_id]);

  const thumb = imageUri && !imageError ? (
    <Image
      source={{ uri: imageUri }}
      style={styles.thumb}
      resizeMode="cover"
      onError={() => setImageError(true)}
    />
  ) : (
    <View style={styles.thumbPlaceholder}>
      {imageUri ? <Icon source="image-off-outline" size={22} color={palette.textMuted} /> : null}
    </View>
  );

  const menuControl = (
    <Menu
      visible={menuOpen}
      onDismiss={() => setMenuOpen(false)}
      anchor={
        <IconButton
          icon="dots-vertical"
          size={20}
          iconColor={palette.textMuted}
          onPress={() => setMenuOpen(true)}
          style={styles.menuBtn}
        />
      }
      anchorPosition="bottom"
    >
      {menuActions.map((action) => (
        <Menu.Item
          key={action.key}
          leadingIcon={action.icon}
          title={action.label}
          titleStyle={action.destructive ? { color: palette.error } : undefined}
          onPress={() => {
            setMenuOpen(false);
            action.onPress();
          }}
        />
      ))}
    </Menu>
  );

  const body = (
    <View
      style={[styles.card, style]}
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      <View style={styles.row}>
        {thumb}
        <Pressable onPress={onPress} style={styles.mainPress} disabled={!onPress}>
          <View style={styles.titleRow}>
            <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.categoryPill}>{item.category}</Text>
          </View>
          <Text style={styles.ingredients} numberOfLines={2}>
            {ingredientsPreview(ingredients)}
          </Text>
        </Pressable>
        <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
          {menuControl}
        </View>
      </View>
    </View>
  );

  return body;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: palette.surface,
  },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainPress: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { flex: 1, fontWeight: '700', color: palette.text },
  categoryPill: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
    backgroundColor: palette.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  ingredients: { color: palette.textMuted, fontSize: 13, marginTop: 8, lineHeight: 18, minHeight: 36 },
  menuAnchor: { marginTop: -4 },
  menuAnchorHidden: { opacity: Platform.OS === 'web' ? 0 : 1 },
  menuBtn: { margin: 0, width: 36, height: 36 },
});
