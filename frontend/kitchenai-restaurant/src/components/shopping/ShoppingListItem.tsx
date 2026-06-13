import React, { useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';
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
};

export function ShoppingListItem({ item, menuActions, style }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const showMenuButton = Platform.OS !== 'web' || hovered || menuOpen;

  return (
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
        <View style={styles.main}>
          <Text variant="bodyLarge" style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.qty}>{formatQty(item.qty, item.unit)}</Text>
        </View>
        <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
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
        </View>
      </View>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  main: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', color: palette.text },
  qty: { color: palette.textMuted, fontSize: 13, marginTop: 6 },
  menuAnchor: { marginTop: -4 },
  menuAnchorHidden: { opacity: Platform.OS === 'web' ? 0 : 1 },
  menuBtn: { margin: 0, width: 36, height: 36 },
});
