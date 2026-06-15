import React, { useState } from 'react';
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

type Props = {
  item: UserShoppingItem;
  index: number;
  selectionMode: boolean;
  selected: boolean;
  menuActions: InventoryMenuAction[];
  onToggleSelect: () => void;
  onEnterSelection: () => void;
  style?: ViewStyle;
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
}: Props) {
  const { catalog } = useIngredientCatalog();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  const openMenu = () => {
    if (Platform.OS === 'web') {
      setMenuOpen(true);
    } else {
      setSheetVisible(true);
    }
  };

  const showMenuButton = !selectionMode && (Platform.OS !== 'web' || hovered || menuOpen);

  const menuControl = Platform.OS === 'web' ? (
    <Menu
      visible={menuOpen}
      onDismiss={() => setMenuOpen(false)}
      anchor={(
        <IconButton
          icon="dots-vertical"
          size={20}
          onPress={openMenu}
          style={styles.menuBtn}
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
      size={20}
      onPress={openMenu}
      style={styles.menuBtn}
    />
  );

  return (
    <>
      <Pressable
        onPress={() => selectionMode && onToggleSelect()}
        onLongPress={() => {
          if (!selectionMode) onEnterSelection();
        }}
      >
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
              <Checkbox
                status={selected ? 'checked' : 'unchecked'}
                onPress={onToggleSelect}
              />
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
                  {(() => {
                    const qtyLabel = formatShoppingQty(item, catalog);
                    return qtyLabel ? (
                      <>
                        <Text style={styles.sep}> · </Text>
                        <Text style={styles.qty}>{qtyLabel}</Text>
                      </>
                    ) : null;
                  })()}
                </Text>
              </View>
            </View>

            <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
              {menuControl}
            </View>
          </View>
        </Surface>
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
});
