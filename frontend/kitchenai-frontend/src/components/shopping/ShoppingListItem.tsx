import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Checkbox, IconButton, Menu, Surface, Text } from 'react-native-paper';
import { UserShoppingItem } from '../../types';
import { formatShoppingQty } from '../../utils/shoppingFormat';
import { useIngredientCatalog } from '../../hooks/useIngredientCatalog';
import {
  InventoryItemActionsSheet,
  type InventoryMenuAction,
} from '../inventory/InventoryItemActionsSheet';
import { IngredientThumb } from '../IngredientThumb';
import { palette } from '../../theme';

type Props = {
  item: UserShoppingItem;
  index: number;
  selectionMode: boolean;
  selected: boolean;
  menuActions: InventoryMenuAction[];
  onToggleSelect: () => void;
  onEnterSelection: () => void;
  style?: ViewStyle;
  variant?: 'list' | 'grid';
};

export function ShoppingListItem({
  item,
  index,
  selectionMode,
  selected,
  menuActions,
  onToggleSelect,
  onEnterSelection,
  style,
  variant = 'list',
}: Props) {
  const { catalog } = useIngredientCatalog();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  const qtyLabel = useMemo(() => formatShoppingQty(item, catalog), [item, catalog]);
  const isGrid = variant === 'grid';

  const openMenu = () => {
    if (Platform.OS === 'web') {
      setMenuOpen(true);
    } else {
      setSheetVisible(true);
    }
  };

  const showMenuButton = !selectionMode && (Platform.OS !== 'web' || hovered || menuOpen);

  const handleCardPress = () => {
    if (selectionMode) {
      onToggleSelect();
      return;
    }
    if (Platform.OS !== 'web') {
      openMenu();
    }
  };

  const menuControl = Platform.OS === 'web' ? (
    <Menu
      visible={menuOpen}
      onDismiss={() => setMenuOpen(false)}
      anchor={(
        <IconButton
          icon="dots-vertical"
          size={isGrid ? 16 : 20}
          onPress={openMenu}
          style={isGrid ? styles.menuBtnGrid : styles.menuBtn}
        />
      )}
      anchorPosition="bottom"
    >
      {menuActions.map((action) => (
        <Menu.Item
          key={action.key}
          leadingIcon={action.icon}
          title={action.label}
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
      onPress={openMenu}
      style={isGrid ? styles.menuBtnGrid : styles.menuBtn}
    />
  );

  const gridCardBody = (
    <Pressable
      onPress={handleCardPress}
      onLongPress={() => {
        if (!selectionMode) onEnterSelection();
      }}
      style={({ pressed }) => [
        styles.gridCard,
        selected && styles.gridCardSelected,
        pressed && !selectionMode && Platform.OS !== 'web' ? styles.gridCardPressed : null,
        style,
      ]}
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      {selectionMode ? (
        <View style={styles.gridSelectAnchor}>
          <Checkbox status={selected ? 'checked' : 'unchecked'} onPress={onToggleSelect} />
        </View>
      ) : (
        <View style={[styles.gridMenuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
          {menuControl}
        </View>
      )}

      <View style={styles.gridColumn}>
        <IngredientThumb name={item.name} size={44} resizeMode="contain" />
        <Text variant="labelMedium" numberOfLines={3} ellipsizeMode="tail" style={styles.gridName}>
          {item.name}
        </Text>
        <Text variant="labelSmall" numberOfLines={2} style={styles.gridMeta}>
          {qtyLabel ?? '—'}
        </Text>
      </View>
    </Pressable>
  );

  const listCardBody = (
    <Surface
      style={[styles.card, selected && styles.cardSelected, style]}
      elevation={1}
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      <View style={styles.row}>
        {selectionMode ? (
          <Checkbox status={selected ? 'checked' : 'unchecked'} onPress={onToggleSelect} />
        ) : null}

        <IngredientThumb name={item.name} size={40} />

        <View style={styles.itemInfo}>
          <View style={styles.titleRow}>
            <View style={styles.nameWrap}>
              <Text
                variant="bodyLarge"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.itemName}
              >
                {item.name}
              </Text>
            </View>
            <Text variant="bodyLarge" style={styles.qtySuffix}>
              {qtyLabel ? (
                <>
                  <Text style={styles.sep}> · </Text>
                  <Text style={styles.qty}>{qtyLabel}</Text>
                </>
              ) : null}
            </Text>
          </View>
        </View>

        <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
          {menuControl}
        </View>
      </View>
    </Surface>
  );

  if (isGrid) {
    return (
      <>
        {gridCardBody}
        {Platform.OS !== 'web' ? (
          <InventoryItemActionsSheet
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
      <Pressable
        onPress={handleCardPress}
        onLongPress={() => {
          if (!selectionMode) onEnterSelection();
        }}
      >
        {listCardBody}
      </Pressable>

      <InventoryItemActionsSheet
        visible={sheetVisible}
        title={item.name}
        actions={menuActions}
        onDismiss={() => setSheetVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: '#2E7D32',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    paddingRight: 4,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  nameWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  itemName: { fontWeight: '600', color: '#333', lineHeight: 22 },
  qtySuffix: { flexShrink: 0, lineHeight: 22 },
  sep: { fontWeight: '400', color: '#888888' },
  qty: { fontWeight: '500', color: '#888888' },
  menuAnchor: {
    margin: 0,
    flexShrink: 0,
  },
  menuAnchorHidden: {
    opacity: 0,
  },
  menuBtn: {
    margin: 0,
  },
  menuBtnGrid: {
    margin: 0,
    width: 28,
    height: 28,
  },
  gridCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
    minHeight: 108,
    flex: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  gridCardSelected: {
    borderWidth: 1.5,
    borderColor: '#2E7D32',
  },
  gridCardPressed: {
    opacity: 0.92,
  },
  gridMenuAnchor: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
  },
  gridSelectAnchor: {
    position: 'absolute',
    top: -2,
    left: -4,
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
    color: palette.textSecondary,
    marginTop: 4,
    lineHeight: 13,
    fontSize: 10,
    width: '100%',
    textAlign: 'center',
  },
});
