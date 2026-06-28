import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';
import { IngredientThumb } from '../IngredientThumb';
import { ItemActionsSheet, type ItemMenuAction } from '../ItemActionsSheet';
import { InventoryRow } from '../../types';
import { palette } from '../../theme';
import { formatFoodGroupLabel, formatQty, normalizeFoodGroup } from '../../utils/foodGroup';

export const LOW_STOCK_THRESHOLD = 1;

type Props = {
  item: InventoryRow;
  style?: ViewStyle;
  showGroup?: boolean;
  variant?: 'list' | 'grid';
  menuActions?: ItemMenuAction[];
};

export function StockListItem({
  item,
  style,
  showGroup = false,
  variant = 'grid',
  menuActions = [],
}: Props) {
  const lowStock = item.qty <= LOW_STOCK_THRESHOLD;
  const groupLabel = formatFoodGroupLabel(item.food_group);
  const qtyLabel = formatQty(item.qty, item.unit);
  const isGrid = variant === 'grid';
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  const openActions = () => {
    if (menuActions.length === 0) return;
    if (Platform.OS === 'web') {
      setMenuOpen(true);
    } else {
      setSheetVisible(true);
    }
  };

  const showMenuButton = menuActions.length > 0 && (Platform.OS !== 'web' || hovered || menuOpen);

  const menuControl =
    menuActions.length > 0 ? (
      Platform.OS === 'web' ? (
        <Menu
          visible={menuOpen}
          onDismiss={() => setMenuOpen(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              size={isGrid ? 16 : 20}
              iconColor={palette.textMuted}
              onPress={openActions}
              style={isGrid ? styles.menuBtnGrid : styles.menuBtn}
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
      ) : (
        <IconButton
          icon="dots-vertical"
          size={isGrid ? 16 : 20}
          iconColor={palette.textMuted}
          onPress={openActions}
          style={isGrid ? styles.menuBtnGrid : styles.menuBtn}
        />
      )
    ) : null;

  const gridCardBody = (
    <Pressable
      onPress={Platform.OS !== 'web' ? openActions : undefined}
      style={({ pressed }) => [
        styles.gridCard,
        lowStock && styles.gridCardLow,
        pressed && Platform.OS !== 'web' ? styles.gridCardPressed : null,
        style,
      ]}
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      {menuControl ? (
        <View style={[styles.gridMenuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
          {menuControl}
        </View>
      ) : null}
      <View style={styles.gridColumn}>
        <IngredientThumb name={item.canonical_name} size={44} resizeMode="contain" />
        <Text variant="labelMedium" numberOfLines={3} ellipsizeMode="tail" style={styles.gridName}>
          {item.canonical_name}
        </Text>
        <Text variant="labelSmall" numberOfLines={2} style={styles.gridMeta}>
          {qtyLabel}
          {lowStock ? (
            <Text style={styles.gridMetaLow}>{'\n'}Low stock</Text>
          ) : null}
        </Text>
      </View>
    </Pressable>
  );

  const listCardBody = (
    <View
      style={[styles.card, lowStock && styles.cardLow, style]}
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      <View style={styles.row}>
        <IngredientThumb name={item.canonical_name} size={40} resizeMode="contain" />
        <View style={styles.main}>
          <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
            {item.canonical_name}
          </Text>
          {showGroup ? <Text style={styles.group}>{groupLabel}</Text> : null}
        </View>
        <View style={styles.qtyBlock}>
          <Text style={[styles.qty, lowStock && styles.qtyLow]}>{qtyLabel}</Text>
          {lowStock ? <Text style={styles.lowBadge}>Low</Text> : null}
        </View>
        {menuControl ? (
          <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>{menuControl}</View>
        ) : null}
      </View>
    </View>
  );

  if (isGrid) {
    return (
      <>
        {gridCardBody}
        {Platform.OS !== 'web' && menuActions.length > 0 ? (
          <ItemActionsSheet
            visible={sheetVisible}
            title={item.canonical_name}
            actions={menuActions}
            onDismiss={() => setSheetVisible(false)}
          />
        ) : null}
      </>
    );
  }

  return listCardBody;
}

export function isLowStock(item: InventoryRow): boolean {
  return item.qty <= LOW_STOCK_THRESHOLD;
}

export function stockGroupKey(item: InventoryRow): string {
  return normalizeFoodGroup(item.food_group);
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
  cardLow: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  main: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', color: palette.text },
  group: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  qtyBlock: { alignItems: 'flex-end' },
  qty: { color: palette.text, fontSize: 15, fontWeight: '700' },
  qtyLow: { color: palette.primary },
  lowBadge: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  menuAnchor: { margin: 0, flexShrink: 0 },
  menuAnchorHidden: { opacity: 0 },
  menuBtn: { margin: 0, width: 36, height: 36 },
  menuBtnGrid: { margin: 0, width: 28, height: 28 },
  gridCard: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
    minHeight: 108,
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
  },
  gridCardLow: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  gridCardPressed: { opacity: 0.92 },
  gridMenuAnchor: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
  },
  gridColumn: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 2,
    paddingHorizontal: 2,
  },
  gridName: {
    fontWeight: '700',
    color: palette.text,
    lineHeight: 15,
    fontSize: 12,
    marginTop: 6,
    width: '100%',
    textAlign: 'center',
  },
  gridMeta: {
    color: palette.textMuted,
    marginTop: 4,
    lineHeight: 13,
    fontSize: 10,
    width: '100%',
    textAlign: 'center',
  },
  gridMetaLow: {
    fontWeight: '700',
    color: palette.primary,
  },
});
