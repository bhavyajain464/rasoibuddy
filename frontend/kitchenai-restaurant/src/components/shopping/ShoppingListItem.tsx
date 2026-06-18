import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';
import { IngredientThumb } from '../IngredientThumb';
import { ItemActionsSheet } from '../ItemActionsSheet';
import { ShoppingRow } from '../../types';
import { palette } from '../../theme';
import { formatQty } from '../../utils/foodGroup';

export type ShoppingMenuAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  item: ShoppingRow;
  menuActions: ShoppingMenuAction[];
  style?: ViewStyle;
  variant?: 'list' | 'grid';
};

export function ShoppingListItem({
  item,
  menuActions,
  style,
  variant = 'grid',
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const qtyLabel = formatQty(item.qty, item.unit);
  const isGrid = variant === 'grid';

  const openMenu = () => {
    if (Platform.OS === 'web') {
      setMenuOpen(true);
    } else {
      setSheetVisible(true);
    }
  };

  const showMenuButton = Platform.OS !== 'web' || hovered || menuOpen;

  const menuControl = Platform.OS === 'web' ? (
    <Menu
      visible={menuOpen}
      onDismiss={() => setMenuOpen(false)}
      anchor={
        <IconButton
          icon="dots-vertical"
          size={isGrid ? 16 : 20}
          iconColor={palette.textMuted}
          onPress={openMenu}
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
      onPress={openMenu}
      style={isGrid ? styles.menuBtnGrid : styles.menuBtn}
    />
  );

  const gridCardBody = (
    <Pressable
      onPress={Platform.OS !== 'web' ? openMenu : undefined}
      style={({ pressed }) => [
        styles.gridCard,
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
      <View style={[styles.gridMenuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
        {menuControl}
      </View>
      <View style={styles.gridColumn}>
        <IngredientThumb name={item.name} size={44} resizeMode="contain" />
        <Text variant="labelMedium" numberOfLines={3} ellipsizeMode="tail" style={styles.gridName}>
          {item.name}
        </Text>
        <Text variant="labelSmall" numberOfLines={2} style={styles.gridMeta}>
          {qtyLabel}
        </Text>
      </View>
    </Pressable>
  );

  const listCardBody = (
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
        <IngredientThumb name={item.name} size={40} resizeMode="contain" />
        <View style={styles.main}>
          <Text variant="bodyLarge" style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.qty}>{qtyLabel}</Text>
        </View>
        <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>{menuControl}</View>
      </View>
    </View>
  );

  if (isGrid) {
    return (
      <>
        {gridCardBody}
        {Platform.OS !== 'web' ? (
          <ItemActionsSheet
            visible={sheetVisible}
            title={item.name}
            actions={menuActions}
            onDismiss={() => setSheetVisible(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <Pressable onPress={openMenu}>{listCardBody}</Pressable>
      {Platform.OS !== 'web' ? (
        <ItemActionsSheet
          visible={sheetVisible}
          title={item.name}
          actions={menuActions}
          onDismiss={() => setSheetVisible(false)}
        />
      ) : null}
    </>
  );
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  main: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', color: palette.text },
  qty: { color: palette.textMuted, fontSize: 13, marginTop: 6 },
  menuAnchor: { marginTop: -4, flexShrink: 0 },
  menuAnchorHidden: { opacity: Platform.OS === 'web' ? 0 : 1 },
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
});
