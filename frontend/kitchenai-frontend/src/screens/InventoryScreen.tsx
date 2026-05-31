import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import {
  Text,
  Searchbar,
  SegmentedButtons,
  IconButton,
  Snackbar,
  Menu,
} from 'react-native-paper';
import {
  useRoute,
  useNavigation,
  useFocusEffect,
  RouteProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { InventoryListItem } from '../components/inventory/InventoryListItem';
import { EditInventoryItemSheet } from '../components/inventory/EditInventoryItemSheet';
import type { InventoryMenuAction } from '../components/inventory/InventoryItemActionsSheet';
import { daysUntilExpiryLocal } from '../utils/expiryDate';
import { AddInventoryModal } from '../components/modals/AddInventoryModal';
import { ScanBillBottomSheet } from '../components/modals/ScanBillBottomSheet';
import * as api from '../services/api';
import { InventoryItem, ExpiringItem, InventoryFoodGroup } from '../types';
import {
  INVENTORY_FOOD_GROUPS,
  foodGroupLabel,
  foodGroupsForDiet,
} from '../constants/inventoryFoodGroups';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { useEntitlements } from '../context/EntitlementsContext';
import { usePlanUpgrade } from '../hooks/usePlanUpgrade';
import { showUpgradeMessage } from '../utils/upgrade';
import { showAppError, showAppInfo, showAppSuccess } from '../utils/alertMessage';
import { TabScreenHeader, TabScreenToolbarRow } from '../components/TabScreenHeader';
import { useAppRefresh } from '../context/AppRefreshContext';
import type { MainTabParamList } from '../navigation/types';

/** Web reload restores scroll on the list node after paint; pin repeatedly without user input. */
function startWebInventoryScrollPin(pin: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const prevRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = 'manual';
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    pin();
    window.scrollTo(0, 0);
  };
  run();
  const timers = [0, 50, 100, 200, 350, 500, 700].map((ms) => window.setTimeout(run, ms));
  const interval = window.setInterval(run, 40);
  const stopInterval = window.setTimeout(() => window.clearInterval(interval), 720);
  return () => {
    cancelled = true;
    timers.forEach((id) => window.clearTimeout(id));
    window.clearInterval(interval);
    window.clearTimeout(stopInterval);
    window.history.scrollRestoration = prevRestoration;
  };
}

type TabValue = 'all' | 'expired';

type PantryItem = InventoryItem | ExpiringItem;

type ItemSnapshot = {
  item_id: string;
  canonical_name: string;
  qty: number;
  unit: string;
  estimated_expiry?: string;
  food_group?: string;
  is_manual: boolean;
};

function snapshotItem(item: PantryItem): ItemSnapshot {
  return {
    item_id: item.item_id,
    canonical_name: item.canonical_name,
    qty: item.qty,
    unit: item.unit,
    estimated_expiry: item.estimated_expiry,
    food_group: 'food_group' in item ? item.food_group : undefined,
    is_manual: 'is_manual' in item ? item.is_manual : true,
  };
}

async function restoreSnapshot(snap: ItemSnapshot) {
  await api.addInventoryItem({
    canonical_name: snap.canonical_name,
    qty: snap.qty,
    unit: snap.unit,
    estimated_expiry: snap.estimated_expiry,
    food_group: snap.food_group,
  });
}

export function InventoryScreen() {
  const { contentPaddingBottom } = useTabBarLayout();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Inventory'>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Inventory'>>();
  const { entitlements, canBillScan } = useEntitlements();
  const { startUpgrade } = usePlanUpgrade();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<ExpiringItem[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabValue>('all');
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);
  const [foodGroups, setFoodGroups] = useState<InventoryFoodGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [expiredGroupFilter, setExpiredGroupFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const snackUndoRef = useRef<(() => Promise<void>) | null>(null);

  const [addMenuVisible, setAddMenuVisible] = useState(false);

  // Manual add bottom sheet
  const [addModalVisible, setAddModalVisible] = useState(false);

  const [editItem, setEditItem] = useState<PantryItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [scanSheetVisible, setScanSheetVisible] = useState(false);

  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const inventoryScrollRef = useRef<ScrollView>(null);
  const skipMountLoadData = useRef(true);
  const skipFilterScrollReset = useRef(true);
  const skipExpiredFilterScrollReset = useRef(true);
  const pendingScrollPinRef = useRef(false);
  const loadSeqRef = useRef(0);
  const webScrollPinCleanupRef = useRef<(() => void) | null>(null);
  const expiredFoodGroupBackfillRef = useRef(false);
  const { version: refreshVersion, bump } = useAppRefresh();

  const expiredNeedsFoodGroupBackfill = useCallback((items: ExpiringItem[]) => {
    if (items.length === 0) return false;
    return items.some((item) => {
      const g = (item.food_group ?? '').trim().toLowerCase();
      return g === '' || g === 'other';
    });
  }, []);

  useEffect(
    () => () => {
      webScrollPinCleanupRef.current?.();
      webScrollPinCleanupRef.current = null;
    },
    [],
  );

  const scrollListToTop = useCallback(() => {
    inventoryScrollRef.current?.scrollTo({ y: 0, animated: false });
    if (Platform.OS === 'web') {
      const node = inventoryScrollRef.current as unknown as {
        getScrollableNode?: () => HTMLElement | null;
      } | null;
      const el = node?.getScrollableNode?.();
      if (el) {
        el.scrollTop = 0;
      }
    }
  }, []);

  /** Pin list after content height changes (post–loadData); beats async browser scroll restoration on web. */
  const pinListScrollToTop = useCallback(() => {
    scrollListToTop();
    if (Platform.OS !== 'web') return;
    requestAnimationFrame(scrollListToTop);
    setTimeout(scrollListToTop, 0);
    setTimeout(scrollListToTop, 50);
    setTimeout(scrollListToTop, 150);
  }, [scrollListToTop]);

  const startWebListScrollPin = useCallback(() => {
    webScrollPinCleanupRef.current?.();
    webScrollPinCleanupRef.current = startWebInventoryScrollPin(scrollListToTop);
  }, [scrollListToTop]);

  /** After filter pill / expiring-soon change — same web scroll restoration as reload. */
  const resetListScrollForFilterChange = useCallback(() => {
    pendingScrollPinRef.current = true;
    scrollListToTop();
    if (Platform.OS === 'web') {
      startWebListScrollPin();
    } else {
      pinListScrollToTop();
    }
  }, [scrollListToTop, startWebListScrollPin, pinListScrollToTop]);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const [inv, exp, expd, groups] = await Promise.all([
        api.fetchInventory(),
        api.fetchExpiringItems(),
        api.fetchExpiredItems(),
        api.fetchInventoryFoodGroups().catch(() => INVENTORY_FOOD_GROUPS),
      ]);
      if (seq !== loadSeqRef.current) return;
      setInventory(Array.isArray(inv) ? inv : []);
      setExpiringItems(Array.isArray(exp) ? exp : []);
      setExpiredItems(Array.isArray(expd) ? expd : []);
      setFoodGroups(
        Array.isArray(groups) && groups.length > 0 ? groups : INVENTORY_FOOD_GROUPS,
      );
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      console.error('Failed to load inventory:', e);
      setInventory([]);
      setExpiringItems([]);
      setExpiredItems([]);
    } finally {
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
      pendingScrollPinRef.current = true;
      if (Platform.OS === 'web') {
        startWebListScrollPin();
      }
    }
  }, [startWebListScrollPin]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      void api.fetchProfile()
        .then((p) => setDietaryTags(p.dietary_tags ?? []))
        .catch(() => setDietaryTags([]));
    }, [loadData]),
  );

  // useFocusEffect already loads on mount; skip duplicate fetch (avoids double layout + scroll jump on web).
  useEffect(() => {
    if (skipMountLoadData.current) {
      skipMountLoadData.current = false;
      return;
    }
    void loadData();
  }, [loadData, refreshVersion]);

  // Classify food_group for expired items still marked other/empty (once per screen visit).
  useEffect(() => {
    if (tab !== 'expired' || loading || expiredFoodGroupBackfillRef.current) return;
    if (!expiredNeedsFoodGroupBackfill(expiredItems)) return;

    expiredFoodGroupBackfillRef.current = true;
    void (async () => {
      try {
        const { enriched } = await api.backfillInventoryFoodGroups({ scope: 'expired' });
        if (enriched > 0) {
          await loadData();
        }
      } catch (e) {
        console.error('Expired food group backfill failed:', e);
        expiredFoodGroupBackfillRef.current = false;
      }
    })();
  }, [tab, loading, expiredItems, expiredNeedsFoodGroupBackfill, loadData]);

  // Deep links from Home (expired banner / expiring soon). Use primitive deps only —
  // `route.params` object identity changes every render on web and caused setParams loops.
  useEffect(() => {
    const tabParam = route.params?.tab;
    const expiringSoonParam = route.params?.expiringSoon;
    if (tabParam !== 'expired' && !expiringSoonParam) return;

    if (tabParam === 'expired') {
      setTab('expired');
      setExpiringSoonFilter(false);
      setExpiredGroupFilter(null);
    } else if (expiringSoonParam) {
      setTab('all');
      setExpiringSoonFilter(true);
    }

    navigation.setParams({ tab: undefined, expiringSoon: undefined });
  }, [route.params?.tab, route.params?.expiringSoon, navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const showSnack = (msg: string) => {
    snackUndoRef.current = null;
    setSnackMsg(msg);
    setSnackVisible(true);
  };

  const showSnackUndo = useCallback((msg: string, undo: () => Promise<void>) => {
    snackUndoRef.current = undo;
    setSnackMsg(msg);
    setSnackVisible(true);
  }, []);

  const openEditItem = useCallback((item: PantryItem) => {
    setEditItem(item);
  }, []);

  const performExpire = useCallback(
    async (item: InventoryItem) => {
      const snap = snapshotItem(item);
      try {
        await api.expireInventoryItem(item.item_id);
        await loadData();
        showSnackUndo(`"${item.canonical_name}" marked as expired.`, async () => {
          await api.updateInventoryItem(snap.item_id, {
            canonical_name: snap.canonical_name,
            qty: snap.qty,
            unit: snap.unit,
            estimated_expiry: snap.estimated_expiry ?? '',
            is_manual: snap.is_manual,
          });
          await loadData();
        });
      } catch {
        showAppError('Could not mark as expired.');
      }
    },
    [loadData, showSnackUndo],
  );

  /** Item used up or cleared from pantry (not expired, not shopping). */
  const performRemoveFromPantry = useCallback(
    async (item: PantryItem) => {
      const snap = snapshotItem(item);
      try {
        await api.deleteInventoryItem(item.item_id);
        await loadData();
        showSnackUndo(`"${item.canonical_name}" removed from pantry.`, async () => {
          await restoreSnapshot(snap);
          await loadData();
        });
      } catch {
        showAppError('Could not remove item.');
      }
    },
    [loadData, showSnackUndo],
  );

  const performAddToShopping = useCallback(
    async (item: ExpiringItem) => {
      const snap = snapshotItem(item);
      try {
        await api.addShoppingItem(item.canonical_name, item.qty, item.unit);
        await api.deleteInventoryItem(item.item_id);
        await loadData();
        bump();
        showSnackUndo(`"${item.canonical_name}" added to shopping list.`, async () => {
          await restoreSnapshot(snap);
          await loadData();
        });
      } catch {
        showAppError('Could not add to shopping list.');
      }
    },
    [loadData, showSnackUndo, bump],
  );

  const buildInStockMenu = useCallback(
    (item: InventoryItem): InventoryMenuAction[] => [
      {
        key: 'edit',
        label: 'Edit',
        icon: 'pencil-outline',
        onPress: () => openEditItem(item),
      },
      {
        key: 'expire',
        label: 'Mark as expired',
        icon: 'clock-alert-outline',
        onPress: () => void performExpire(item),
      },
      {
        key: 'remove',
        label: 'Remove from pantry',
        icon: 'check-circle-outline',
        onPress: () => void performRemoveFromPantry(item),
      },
    ],
    [openEditItem, performExpire, performRemoveFromPantry],
  );

  const buildExpiredMenu = useCallback(
    (item: ExpiringItem): InventoryMenuAction[] => [
      {
        key: 'edit',
        label: 'Edit',
        icon: 'pencil-outline',
        onPress: () => openEditItem(item),
      },
      {
        key: 'shopping',
        label: 'Add to shopping list',
        icon: 'cart-plus',
        onPress: () => void performAddToShopping(item),
      },
      {
        key: 'remove',
        label: 'Remove from pantry',
        icon: 'check-circle-outline',
        onPress: () => void performRemoveFromPantry(item),
      },
    ],
    [openEditItem, performAddToShopping, performRemoveFromPantry],
  );

  const handleSaveEdit = async (patch: {
    canonical_name: string;
    qty: number;
    unit: string;
    estimated_expiry: string;
    is_manual: boolean;
  }) => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      await api.updateInventoryItem(editItem.item_id, patch);
      await loadData();
      showSnack(`"${patch.canonical_name}" updated`);
      setEditItem(null);
    } catch {
      showAppError('Could not save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  const openScanSheet = () => {
    if (!canBillScan) {
      showUpgradeMessage(
        entitlements?.bill_scans_used != null
          ? `You've used all ${entitlements.bill_scan_limit} free bill scans for today.`
          : 'Daily bill scan limit reached on the free plan.',
        startUpgrade,
      );
      return;
    }
    setScanSheetVisible(true);
  };

  // ── Filtered lists ──────────────────────────────────────────

  const searchLower = search.toLowerCase();

  const expiringIds = new Set(expiringItems.map((e) => e.item_id));

  const groupMeta = useMemo(() => {
    const base = foodGroups.length > 0 ? foodGroups : INVENTORY_FOOD_GROUPS;
    return foodGroupsForDiet(base, dietaryTags);
  }, [foodGroups, dietaryTags]);

  const itemGroupId = useCallback((foodGroup?: string) => {
    const raw = foodGroup || 'other';
    return raw === 'protein' ? 'non_veg' : raw;
  }, []);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of inventory) {
      const gid = itemGroupId(item.food_group);
      counts[gid] = (counts[gid] ?? 0) + 1;
    }
    return counts;
  }, [inventory, itemGroupId]);

  const expiredGroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of expiredItems) {
      const gid = itemGroupId(item.food_group);
      counts[gid] = (counts[gid] ?? 0) + 1;
    }
    return counts;
  }, [expiredItems, itemGroupId]);

  const groupFilterOptions = useMemo(() => {
    return [...groupMeta]
      .filter((g) => (groupCounts[g.id] ?? 0) > 0)
      .sort((a, b) => a.sort - b.sort);
  }, [groupMeta, groupCounts]);

  const expiredGroupFilterOptions = useMemo(() => {
    return [...groupMeta]
      .filter((g) => (expiredGroupCounts[g.id] ?? 0) > 0)
      .sort((a, b) => a.sort - b.sort);
  }, [groupMeta, expiredGroupCounts]);

  useEffect(() => {
    if (groupFilter && (groupCounts[groupFilter] ?? 0) === 0) {
      setGroupFilter(null);
    }
  }, [groupFilter, groupCounts]);

  useEffect(() => {
    if (expiredGroupFilter && (expiredGroupCounts[expiredGroupFilter] ?? 0) === 0) {
      setExpiredGroupFilter(null);
    }
  }, [expiredGroupFilter, expiredGroupCounts]);

  useEffect(() => {
    if (expiringItems.length === 0 && expiringSoonFilter) {
      setExpiringSoonFilter(false);
    }
  }, [expiringItems.length, expiringSoonFilter]);

  const filteredInventory = useMemo(
    () =>
      inventory
        .filter((item) => item.canonical_name.toLowerCase().includes(searchLower))
        .filter((item) => {
          if (!item.estimated_expiry) return true;
          const days = daysUntilExpiryLocal(item.estimated_expiry);
          return days === null || days >= 0;
        })
        .filter((item) => !expiringSoonFilter || expiringIds.has(item.item_id))
        .filter((item) => !groupFilter || itemGroupId(item.food_group) === groupFilter),
    [inventory, searchLower, expiringSoonFilter, expiringIds, groupFilter, itemGroupId],
  );

  const filteredExpired = useMemo(
    () =>
      expiredItems
        .filter((item) => item.canonical_name.toLowerCase().includes(searchLower))
        .filter((item) => !expiredGroupFilter || itemGroupId(item.food_group) === expiredGroupFilter),
    [expiredItems, searchLower, expiredGroupFilter, itemGroupId],
  );

  // User changed filter pills (skip first run on mount).
  useLayoutEffect(() => {
    if (tab !== 'all') return;
    if (skipFilterScrollReset.current) {
      skipFilterScrollReset.current = false;
      return;
    }
    resetListScrollForFilterChange();
  }, [groupFilter, expiringSoonFilter, tab, resetListScrollForFilterChange]);

  useLayoutEffect(() => {
    if (tab !== 'expired') return;
    if (skipExpiredFilterScrollReset.current) {
      skipExpiredFilterScrollReset.current = false;
      return;
    }
    resetListScrollForFilterChange();
  }, [expiredGroupFilter, tab, resetListScrollForFilterChange]);

  const inventoryListKey = loading
    ? 'inventory-list-loading'
    : `inventory-list-${groupFilter ?? 'all'}-${expiringSoonFilter ? 'expiring' : 'all'}`;

  const expiredListKey = loading
    ? 'expired-list-loading'
    : `expired-list-${expiredGroupFilter ?? 'all'}`;

  const handleListContentSizeChange = useCallback(() => {
    if (!pendingScrollPinRef.current) return;
    pendingScrollPinRef.current = false;
    pinListScrollToTop();
  }, [pinListScrollToTop]);

  // ── Render ────────────────────────────────────────────────

  const listBottomPad = contentPaddingBottom(24);
  const listContentStyle = useMemo(
    () => [
      styles.list,
      filteredInventory.length === 0 && styles.listContentGrow,
      { paddingBottom: listBottomPad },
      Platform.OS === 'web' ? ({ overflowAnchor: 'none' } as const) : null,
    ],
    [filteredInventory.length, listBottomPad],
  );

  const expiredListContentStyle = useMemo(
    () => [
      styles.list,
      filteredExpired.length === 0 && styles.listContentGrow,
      { paddingBottom: listBottomPad },
      Platform.OS === 'web' ? ({ overflowAnchor: 'none' } as const) : null,
    ],
    [filteredExpired.length, listBottomPad],
  );

  return (
    <View style={styles.container}>
      <TabScreenHeader
        title="Inventory"
        subtitle={loading ? 'Loading your kitchen…' : 'Your kitchen, perfectly tracked'}
      />

      <TabScreenToolbarRow>
        <Searchbar
          placeholder="Search items…"
          value={search}
          onChangeText={setSearch}
          style={styles.searchbarInRow}
          inputStyle={styles.searchInput}
          iconColor="#2E7D32"
          elevation={2}
        />
        <Menu
          visible={addMenuVisible}
          onDismiss={() => setAddMenuVisible(false)}
          anchor={
            <IconButton
              icon="plus"
              mode="contained"
              containerColor="#2E7D32"
              iconColor="#fff"
              size={22}
              onPress={() => setAddMenuVisible(true)}
              style={styles.searchAddBtn}
              accessibilityLabel="Add inventory item"
            />
          }
          anchorPosition="bottom"
        >
          <Menu.Item
            leadingIcon="pencil-plus"
            title="Add Manually"
            onPress={() => {
              setAddMenuVisible(false);
              setAddModalVisible(true);
            }}
          />
          <Menu.Item
            leadingIcon="camera"
            title="Scan & Add"
            onPress={() => {
              setAddMenuVisible(false);
              openScanSheet();
            }}
          />
        </Menu>
      </TabScreenToolbarRow>

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => {
          setTab(v as TabValue);
          pendingScrollPinRef.current = true;
          scrollListToTop();
        }}
        buttons={[
          { value: 'all', label: 'In stock' },
          { value: 'expired', label: 'Expired' },
        ]}
        style={styles.tabs}
      />

      {tab === 'all' && (
        <View style={styles.tabBody}>
          <FilterPillRow style={styles.filterPillRow}>
            <FilterPill
              key="all"
              label={`All (${inventory.length})`}
              selected={groupFilter === null && !expiringSoonFilter}
              onPress={() => {
                setGroupFilter(null);
                setExpiringSoonFilter(false);
              }}
            />
            {expiringItems.length > 0 ? (
              <FilterPill
                key="expiring"
                label={`Expiring Soon (${expiringItems.length})`}
                selected={expiringSoonFilter}
                onPress={() => {
                  setExpiringSoonFilter((on) => {
                    if (!on) setGroupFilter(null);
                    return !on;
                  });
                }}
              />
            ) : null}
            {groupFilterOptions.map((g) => {
              const count = groupCounts[g.id] ?? 0;
              const selected = groupFilter === g.id;
              return (
                <FilterPill
                  key={g.id}
                  label={`${foodGroupLabel(g.id, groupMeta)} (${count})`}
                  selected={selected}
                  onPress={() => {
                    setExpiringSoonFilter(false);
                    setGroupFilter(selected ? null : g.id);
                  }}
                />
              );
            })}
          </FilterPillRow>
          <View style={styles.carouselListSeparator} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <ScrollView
            key={inventoryListKey}
            ref={inventoryScrollRef}
            style={styles.listFlex}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            scrollEnabled={!loading}
            onContentSizeChange={handleListContentSizeChange}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {filteredInventory.length === 0 ? (
              <Text variant="bodyMedium" style={styles.emptyText}>
                {loading
                  ? 'Loading...'
                  : groupFilter
                    ? 'No items in this group.'
                    : expiringSoonFilter
                      ? 'No items expiring soon — you\'re in good shape!'
                      : 'No items yet. Use + next to search to add or scan a bill.'}
              </Text>
            ) : (
              filteredInventory.map((item) => (
                <InventoryListItem
                  key={item.item_id}
                  kind="in_stock"
                  item={item}
                  menuActions={buildInStockMenu(item)}
                  onSwipeLeft={() => void performExpire(item)}
                  onSwipeRight={() => void performRemoveFromPantry(item)}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}

      {tab === 'expired' && (
        <View style={styles.tabBody}>
          <FilterPillRow style={styles.filterPillRow}>
            <FilterPill
              key="all"
              label={`All (${expiredItems.length})`}
              selected={expiredGroupFilter === null}
              onPress={() => setExpiredGroupFilter(null)}
            />
            {expiredGroupFilterOptions.map((g) => {
              const count = expiredGroupCounts[g.id] ?? 0;
              const selected = expiredGroupFilter === g.id;
              return (
                <FilterPill
                  key={g.id}
                  label={`${foodGroupLabel(g.id, groupMeta)} (${count})`}
                  selected={selected}
                  onPress={() => setExpiredGroupFilter(selected ? null : g.id)}
                />
              );
            })}
          </FilterPillRow>
          <View style={styles.carouselListSeparator} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <ScrollView
            key={expiredListKey}
            ref={inventoryScrollRef}
            style={styles.listFlex}
            contentContainerStyle={expiredListContentStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            scrollEnabled={!loading}
            onContentSizeChange={handleListContentSizeChange}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {filteredExpired.length === 0 ? (
              <Text variant="bodyMedium" style={styles.emptyText}>
                {loading
                  ? 'Loading...'
                  : expiredGroupFilter
                    ? 'No expired items in this group.'
                    : 'No expired items — great job managing your kitchen!'}
              </Text>
            ) : (
              filteredExpired.map((item) => (
                <InventoryListItem
                  key={item.item_id}
                  kind="expired"
                  item={item}
                  menuActions={buildExpiredMenu(item)}
                  onSwipeLeft={() => void performAddToShopping(item)}
                  onSwipeRight={() => void performRemoveFromPantry(item)}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}

      <AddInventoryModal
        visible={addModalVisible}
        onDismiss={() => setAddModalVisible(false)}
        onAdded={() => void loadData()}
      />

      <EditInventoryItemSheet
        visible={editItem !== null}
        item={editItem}
        onDismiss={() => !editSaving && setEditItem(null)}
        onSave={handleSaveEdit}
        saving={editSaving}
      />

      <ScanBillBottomSheet
        visible={scanSheetVisible}
        onDismiss={() => setScanSheetVisible(false)}
        onAdded={() => void loadData()}
        groupMeta={groupMeta}
      />

      <Snackbar
        visible={snackVisible}
        onDismiss={() => {
          setSnackVisible(false);
          snackUndoRef.current = null;
        }}
        duration={5000}
        action={
          snackUndoRef.current
            ? {
                label: 'Undo',
                onPress: () => {
                  const undo = snackUndoRef.current;
                  snackUndoRef.current = null;
                  setSnackVisible(false);
                  if (undo) void undo().catch(() => showAppError('Undo failed.'));
                },
              }
            : { label: 'OK', onPress: () => setSnackVisible(false) }
        }
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  searchbarInRow: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    elevation: 2,
    backgroundColor: '#fff',
  },
  searchAddBtn: {
    margin: 0,
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  searchInput: {
    minHeight: 20,
  },
  tabs: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tabBody: {
    flex: 1,
    minHeight: 0,
  },
  filterPillRow: {
    marginBottom: 0,
  },
  carouselListSeparator: {
    height: 10,
    backgroundColor: '#EBEBEB',
    marginTop: 8,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  listContentGrow: {
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    paddingHorizontal: 32,
  },
  // Shared modal
  modal: {
    backgroundColor: 'white',
    margin: 20,
    padding: 24,
    borderRadius: 16,
  },
  modalTitle: {
    fontWeight: 'bold',
  },
  modalDivider: {
    marginVertical: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  input: {
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },

});
