import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { InventoryItem, ExpiringItem } from '../../types';
import { daysUntilExpiryLocal, formatExpiryCountdown } from '../../utils/expiryDate';
import { resolveCatalogItem } from '../../utils/ingredientUnits';
import { formatPurchaseQty } from '../../utils/purchaseUnits';
import { useIngredientCatalog } from '../../hooks/useIngredientCatalog';
import { InventoryItemActionsSheet, type InventoryMenuAction } from './InventoryItemActionsSheet';
import { IngredientThumb } from '../IngredientThumb';
import { palette } from '../../theme';

export type InventoryListKind = 'in_stock' | 'expired';

type PantryItem = InventoryItem | ExpiringItem;

type SwipeAction = {
  key: string;
  label: string;
  icon: string;
  backgroundColor: string;
  onPress: () => void;
};

type Props = {
  kind: InventoryListKind;
  item: PantryItem;
  menuActions: InventoryMenuAction[];
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  style?: ViewStyle;
};

function SwipeActionButton({
  action,
  progress,
  dragX,
  side,
}: {
  action: SwipeAction;
  progress: Animated.AnimatedInterpolation<number>;
  dragX: Animated.AnimatedInterpolation<number>;
  side: 'left' | 'right';
}) {
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: side === 'right' ? [72, 0] : [-72, 0],
  });

  return (
    <Animated.View style={[styles.swipeActionWrap, { transform: [{ translateX }] }]}>
      <RectButton
        style={[styles.swipeActionBtn, { backgroundColor: action.backgroundColor }]}
        onPress={action.onPress}
      >
        <Text variant="labelMedium" style={styles.swipeActionLabel}>
          {action.label}
        </Text>
      </RectButton>
    </Animated.View>
  );
}

export function InventoryListItem({
  kind,
  item,
  menuActions,
  onSwipeLeft,
  onSwipeRight,
  style,
}: Props) {
  const { catalog } = useIngredientCatalog();
  const catalogItem = React.useMemo(
    () => resolveCatalogItem(catalog, undefined, item.canonical_name),
    [catalog, item.canonical_name],
  );
  const qtyLabel = React.useMemo(
    () => formatPurchaseQty(item.qty, item.unit, catalogItem),
    [item.qty, item.unit, catalogItem],
  );
  const swipeRef = useRef<Swipeable>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  const daysLeft =
    'days_until_expiry' in item && item.days_until_expiry != null
      ? item.days_until_expiry
      : item.estimated_expiry
        ? daysUntilExpiryLocal(item.estimated_expiry)
        : null;

  const isExpired = kind === 'expired' || (daysLeft !== null && daysLeft < 0);
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;
  const expiryLabel = formatExpiryCountdown(daysLeft);

  const closeSwipe = () => swipeRef.current?.close();

  const leftSwipe: SwipeAction | null =
    onSwipeRight
      ? {
          key: 'remove',
          label: kind === 'in_stock' ? 'Used up' : 'Remove',
          icon: 'check-circle-outline',
          backgroundColor: palette.primaryLight,
          onPress: () => {
            closeSwipe();
            onSwipeRight();
          },
        }
      : null;

  const rightSwipe: SwipeAction | null =
    onSwipeLeft
      ? kind === 'in_stock'
        ? {
            key: 'expire',
            label: 'Expired',
            icon: 'clock-alert-outline',
            backgroundColor: '#E65100',
            onPress: () => {
              closeSwipe();
              onSwipeLeft();
            },
          }
        : {
            key: 'shopping',
            label: 'Shopping',
            icon: 'cart-plus',
            backgroundColor: '#2E7D32',
            onPress: () => {
              closeSwipe();
              onSwipeLeft();
            },
          }
      : null;

  const renderLeftActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      if (!leftSwipe) return null;
      return <SwipeActionButton action={leftSwipe} progress={progress} dragX={dragX} side="left" />;
    },
    [leftSwipe],
  );

  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      if (!rightSwipe) return null;
      return <SwipeActionButton action={rightSwipe} progress={progress} dragX={dragX} side="right" />;
    },
    [rightSwipe],
  );

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
          size={20}
          onPress={openMenu}
          style={styles.menuBtn}
        />
      }
      anchorPosition="bottom"
    >
      {menuActions.map((a) => (
        <Menu.Item
          key={a.key}
          leadingIcon={a.icon}
          title={a.label}
          onPress={() => {
            setMenuOpen(false);
            a.onPress();
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

  const cardBody = (
    <View
      style={[styles.card, kind === 'expired' && styles.cardExpired, style]}
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      <View style={styles.row}>
        <IngredientThumb name={item.canonical_name} size={40} />
        <View style={styles.left}>
          <View style={styles.titleRow}>
            <View style={styles.nameWrap}>
              <Text
                variant="bodyLarge"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.name}
              >
                {item.canonical_name}
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

        <View style={styles.right}>
          {expiryLabel ? (
            <Text
              variant="labelMedium"
              numberOfLines={1}
              style={[
                styles.expiry,
                isExpired && styles.expiryPast,
                isUrgent && !isExpired && styles.expiryUrgent,
              ]}
            >
              {expiryLabel}
            </Text>
          ) : null}
          <View style={[styles.menuAnchor, !showMenuButton && styles.menuAnchorHidden]}>
            {menuControl}
          </View>
        </View>
      </View>
    </View>
  );

  const swipeEnabled = Platform.OS !== 'web' && (leftSwipe || rightSwipe);

  return (
    <>
      {swipeEnabled ? (
        <Swipeable
          ref={swipeRef}
          friction={2}
          overshootLeft={false}
          overshootRight={false}
          renderLeftActions={leftSwipe ? renderLeftActions : undefined}
          renderRightActions={rightSwipe ? renderRightActions : undefined}
        >
          {cardBody}
        </Swipeable>
      ) : (
        cardBody
      )}

      {Platform.OS !== 'web' ? (
        <InventoryItemActionsSheet
          visible={sheetVisible}
          title={item.canonical_name}
          actions={menuActions}
          onDismiss={() => setSheetVisible(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardExpired: {
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  left: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  nameWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  name: {
    lineHeight: 22,
    fontWeight: '700',
    color: palette.text,
  },
  qtySuffix: {
    flexShrink: 0,
    lineHeight: 22,
  },
  sep: {
    fontWeight: '400',
    color: palette.textMuted,
  },
  qty: {
    fontWeight: '500',
    color: palette.textSecondary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
    maxWidth: '52%',
  },
  expiry: {
    color: '#FF9800',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  expiryUrgent: {
    color: '#E65100',
  },
  expiryPast: {
    color: '#C62828',
  },
  menuAnchor: {
    margin: 0,
    flexShrink: 0,
  },
  menuAnchorHidden: {
    opacity: 0,
  },
  menuBtn: {
    margin: 0,
    width: 36,
    height: 36,
  },
  swipeActionWrap: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 6,
  },
  swipeActionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    marginHorizontal: 4,
    minWidth: 88,
    paddingHorizontal: 8,
  },
  swipeActionLabel: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
});
