import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  RefreshControl,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import {
  Text,
  Searchbar,
  SegmentedButtons,
  IconButton,
  Menu,
} from 'react-native-paper';
import {
  useRoute,
  useNavigation,
  useFocusEffect,
  useIsFocused,
  RouteProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { InventoryListItem } from '../components/inventory/InventoryListItem';
import { EditInventoryItemSheet } from '../components/inventory/EditInventoryItemSheet';
import type { InventoryMenuAction } from '../components/inventory/InventoryItemActionsSheet';
import { AddInventoryModal } from '../components/modals/AddInventoryModal';
import { ScanBillBottomSheet } from '../components/modals/ScanBillBottomSheet';
import * as api from '../services/api';
import { InventoryItem, ExpiringItem, InventoryFoodGroup } from '../types';
import {
  foodGroupLabel,
} from '../constants/inventoryFoodGroups';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { useEntitlements } from '../context/EntitlementsContext';
import { usePlanUpgrade } from '../hooks/usePlanUpgrade';
import { showUpgradeMessage } from '../utils/upgrade';
import { showAppError, showAppInfo, showAppSuccess } from '../utils/alertMessage';
import { TabScreenHeader, TabScreenToolbarRow } from '../components/TabScreenHeader';
import { useAppRefresh, refreshAppliesTo } from '../context/AppRefreshContext';
import type { MainTabParamList } from '../navigation/types';
import { useUndoSnackbar } from '../hooks/useUndoSnackbar';

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

const INVENTORY_GRID_COLUMNS = 3;
const INVENTORY_GRID_GAP = 6;
const INVENTORY_GRID_PAD = 10;

type PantryItem = InventoryItem | ExpiringItem;

type PantryListEntry<T> = { item: T; index: number };

type PendingPantryRemove = {
  inventory?: PantryListEntry<InventoryItem>;
  expiring?: PantryListEntry<ExpiringItem>;
  expired?: PantryListEntry<ExpiringItem>;
};

type PendingPantryExpire = {
  inventory?: PantryListEntry<InventoryItem>;
  expiring?: PantryListEntry<ExpiringItem>;
  addedExpired: PantryListEntry<ExpiringItem>;
};

type PendingPantryAddToShopping = PendingPantryRemove & {
  name: string;
  qty: number;
  unit: string;
};

function yesterdayExpiryIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toExpiredPreview(item: InventoryItem | ExpiringItem): ExpiringItem {
  const estimated_expiry = yesterdayExpiryIso();
  return {
    item_id: item.item_id,
    ingredient_id: item.ingredient_id,
    canonical_name: item.canonical_name,
    qty: item.qty,
    unit: item.unit,
    food_group: item.food_group,
    display_qty: item.display_qty,
    catalog: item.catalog,
    estimated_expiry,
    days_until_expiry: -1,
    updated_at: 'updated_at' in item ? item.updated_at : undefined,
  };
}

export function InventoryScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { contentPaddingBottom } = useTabBarLayout();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Inventory'>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Inventory'>>();
  const { entitlements, canBillScan } = useEntitlements();
  const { startUpgrade } = usePlanUpgrade();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<ExpiringItem[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabValue>(() =>
    route.params?.tab === 'expired' ? 'expired' : 'all',
  );
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);
  const [foodGroups, setFoodGroups] = useState<InventoryFoodGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [expiredGroupFilter, setExpiredGroupFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const { show: showSnack, showUndo, cancelCommit, undoSnackbar } = useUndoSnackbar();
  const pendingPantryRemovesRef = useRef<Map<string, PendingPantryRemove>>(new Map());
  const pendingPantryExpiresRef = useRef<Map<string, PendingPantryExpire>>(new Map());
  const pendingPantryAddToShoppingRef = useRef<Map<string, PendingPantryAddToShopping>>(new Map());

  const inventoryRef = useRef(inventory);
  const expiringItemsRef = useRef(expiringItems);
  const expiredItemsRef = useRef(expiredItems);
  inventoryRef.current = inventory;
  expiringItemsRef.current = expiringItems;
  expiredItemsRef.current = expiredItems;

  const [addMenuVisible, setAddMenuVisible] = useState(false);

  // Manual add bottom sheet
  const [addModalVisible, setAddModalVisible] = useState(false);

  const [editItem, setEditItem] = useState<PantryItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [scanSheetVisible, setScanSheetVisible] = useState(false);

  const inventoryScrollRef = useRef<ScrollView>(null);
  const skipMountLoadData = useRef(true);
  const skipFilterScrollReset = useRef(true);
  const skipExpiredFilterScrollReset = useRef(true);
  const pendingScrollPinRef = useRef(false);
  const loadSeqRef = useRef(0);
  const webScrollPinCleanupRef = useRef<(() => void) | null>(null);
  const skipInventoryFocusLoadRef = useRef(true);
  /** Set when expired bucket fetch succeeds; kept for compatibility (not used to skip loads). */
  const expiredLoadedRef = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const isFocused = useIsFocused();
  const { version: refreshVersion, scope: refreshScope, bump } = useAppRefresh();

  useEffect(
    () => () => {
      webScrollPinCleanupRef.current?.();
      webScrollPinCleanupRef.current = null;
    },
    [],
  );

  const restorePantryEntries = useCallback((pending: PendingPantryRemove) => {
    if (pending.inventory) {
      const { item, index } = pending.inventory;
      setInventory((prev) => {
        if (prev.some((i) => i.item_id === item.item_id)) return prev;
        const list = [...prev];
        list.splice(Math.min(index, list.length), 0, item);
        return list;
      });
    }
    if (pending.expiring) {
      const { item, index } = pending.expiring;
      setExpiringItems((prev) => {
        if (prev.some((i) => i.item_id === item.item_id)) return prev;
        const list = [...prev];
        list.splice(Math.min(index, list.length), 0, item);
        return list;
      });
    }
    if (pending.expired) {
      const { item, index } = pending.expired;
      setExpiredItems((prev) => {
        if (prev.some((i) => i.item_id === item.item_id)) return prev;
        const list = [...prev];
        list.splice(Math.min(index, list.length), 0, item);
        return list;
      });
    }
  }, []);

  const optimisticallyRemovePantryItem = useCallback((itemId: string): PendingPantryRemove => {
    const captured: PendingPantryRemove = {};

    const inv = inventoryRef.current;
    const invIndex = inv.findIndex((i) => i.item_id === itemId);
    if (invIndex >= 0) captured.inventory = { item: inv[invIndex], index: invIndex };

    const expiring = expiringItemsRef.current;
    const expiringIndex = expiring.findIndex((i) => i.item_id === itemId);
    if (expiringIndex >= 0) captured.expiring = { item: expiring[expiringIndex], index: expiringIndex };

    const expired = expiredItemsRef.current;
    const expiredIndex = expired.findIndex((i) => i.item_id === itemId);
    if (expiredIndex >= 0) captured.expired = { item: expired[expiredIndex], index: expiredIndex };

    setInventory((prev) => prev.filter((i) => i.item_id !== itemId));
    setExpiringItems((prev) => prev.filter((i) => i.item_id !== itemId));
    setExpiredItems((prev) => prev.filter((i) => i.item_id !== itemId));

    return captured;
  }, []);

  const commitPantryRemove = useCallback(
    (itemId: string) => {
      const pending = pendingPantryRemovesRef.current.get(itemId);
      if (!pending) return;
      pendingPantryRemovesRef.current.delete(itemId);
      void api.deleteInventoryItem(itemId).catch(() => {
        restorePantryEntries(pending);
        showAppError('Could not remove item.');
      });
    },
    [restorePantryEntries],
  );

  const flushPendingPantryRemoves = useCallback(() => {
    const itemIds = [...pendingPantryRemovesRef.current.keys()];
    if (itemIds.length === 0) return;
    itemIds.forEach((itemId) => commitPantryRemove(itemId));
    cancelCommit();
  }, [commitPantryRemove, cancelCommit]);

  const restorePantryExpire = useCallback((pending: PendingPantryExpire) => {
    const expiredId = pending.addedExpired.item.item_id;
    setExpiredItems((prev) => prev.filter((i) => i.item_id !== expiredId));
    restorePantryEntries({
      inventory: pending.inventory,
      expiring: pending.expiring,
    });
  }, [restorePantryEntries]);

  const optimisticallyExpirePantryItem = useCallback((item: PantryItem): PendingPantryExpire => {
    const itemId = item.item_id;

    const inv = inventoryRef.current;
    const invIndex = inv.findIndex((i) => i.item_id === itemId);

    const expiring = expiringItemsRef.current;
    const expiringIndex = expiring.findIndex((i) => i.item_id === itemId);

    const source =
      (invIndex >= 0 ? inv[invIndex] : undefined) ??
      (expiringIndex >= 0 ? expiring[expiringIndex] : undefined) ??
      item;
    const preview = toExpiredPreview(source);

    const captured: PendingPantryExpire = {
      addedExpired: { item: preview, index: 0 },
    };
    if (invIndex >= 0) captured.inventory = { item: inv[invIndex], index: invIndex };
    if (expiringIndex >= 0) captured.expiring = { item: expiring[expiringIndex], index: expiringIndex };

    setInventory((prev) => prev.filter((i) => i.item_id !== itemId));
    setExpiringItems((prev) => prev.filter((i) => i.item_id !== itemId));
    setExpiredItems((prev) => {
      const without = prev.filter((i) => i.item_id !== itemId);
      return [preview, ...without];
    });

    return captured;
  }, []);

  const commitPantryExpire = useCallback(
    (itemId: string) => {
      const pending = pendingPantryExpiresRef.current.get(itemId);
      if (!pending) return;
      pendingPantryExpiresRef.current.delete(itemId);
      void api.expireInventoryItem(itemId).then(() => bump('inventory')).catch(() => {
        restorePantryExpire(pending);
        showAppError('Could not mark as expired.');
      });
    },
    [restorePantryExpire, bump],
  );

  const flushPendingPantryExpires = useCallback(() => {
    const itemIds = [...pendingPantryExpiresRef.current.keys()];
    if (itemIds.length === 0) return;
    itemIds.forEach((itemId) => commitPantryExpire(itemId));
    cancelCommit();
  }, [commitPantryExpire, cancelCommit]);

  const commitPantryAddToShopping = useCallback(
    (itemId: string) => {
      const pending = pendingPantryAddToShoppingRef.current.get(itemId);
      if (!pending) return;
      pendingPantryAddToShoppingRef.current.delete(itemId);
      void (async () => {
        try {
          await api.addShoppingItem(pending.name, pending.qty, pending.unit);
          await api.deleteInventoryItem(itemId);
          bump('inventory');
        } catch {
          restorePantryEntries(pending);
          showAppError('Could not add to shopping list.');
        }
      })();
    },
    [restorePantryEntries, bump],
  );

  const flushPendingPantryAddToShopping = useCallback(() => {
    const itemIds = [...pendingPantryAddToShoppingRef.current.keys()];
    if (itemIds.length === 0) return;
    itemIds.forEach((itemId) => commitPantryAddToShopping(itemId));
    cancelCommit();
  }, [commitPantryAddToShopping, cancelCommit]);

  const flushPendingPantryActions = useCallback(() => {
    flushPendingPantryRemoves();
    flushPendingPantryExpires();
    flushPendingPantryAddToShopping();
  }, [flushPendingPantryRemoves, flushPendingPantryExpires, flushPendingPantryAddToShopping]);

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

  const loadInStock = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [data, groups] = await Promise.all([
        api.fetchInventoryBuckets(['active', 'expiring']),
        api.fetchInventoryFoodGroups().catch(() => [] as InventoryFoodGroup[]),
      ]);
      if (seq !== loadSeqRef.current) return;
      setInventory(Array.isArray(data.active) ? data.active : []);
      setExpiringItems(Array.isArray(data.expiring) ? data.expiring : []);
      setFoodGroups(Array.isArray(groups) ? groups : []);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      console.error('Failed to load inventory:', e);
      setInventory([]);
      setExpiringItems([]);
    } finally {
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
      pendingScrollPinRef.current = true;
      if (Platform.OS === 'web') {
        startWebListScrollPin();
      }
    }
  }, [startWebListScrollPin]);

  const loadExpired = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [data, groups] = await Promise.all([
        api.fetchInventoryBuckets(['expired']),
        api.fetchInventoryFoodGroups().catch(() => [] as InventoryFoodGroup[]),
      ]);
      if (seq !== loadSeqRef.current) return;
      setExpiredItems(Array.isArray(data.expired) ? data.expired : []);
      setFoodGroups(Array.isArray(groups) ? groups : []);
      expiredLoadedRef.current = true;
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      console.error('Failed to load expired inventory:', e);
      setExpiredItems([]);
    } finally {
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (tabRef.current === 'expired') {
      await loadExpired();
      return;
    }
    await loadInStock();
  }, [loadInStock, loadExpired]);

  // Reload the active segment whenever In stock ↔ Expired changes.
  useEffect(() => {
    if (tab === 'expired') {
      void loadExpired();
    } else {
      void loadInStock();
    }
  }, [tab, loadInStock, loadExpired]);

  useFocusEffect(
    useCallback(() => {
      if (skipInventoryFocusLoadRef.current) {
        skipInventoryFocusLoadRef.current = false;
        return;
      }
      if (tabRef.current === 'expired') {
        void loadExpired();
      } else {
        void loadInStock();
      }
    }, [loadInStock, loadExpired]),
  );

  // Global inventory refresh (e.g. add item modal) while this tab is focused.
  useEffect(() => {
    if (!isFocused) return;
    if (skipMountLoadData.current) {
      skipMountLoadData.current = false;
      return;
    }
    if (!refreshAppliesTo(refreshScope, 'inventory')) return;
    void loadData();
  }, [isFocused, loadData, refreshVersion, refreshScope]);

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

  const openEditItem = useCallback((item: PantryItem) => {
    setEditItem(item);
  }, []);

  const performExpire = useCallback(
    (item: PantryItem) => {
      const itemId = item.item_id;
      flushPendingPantryActions();

      const captured = optimisticallyExpirePantryItem(item);
      pendingPantryExpiresRef.current.set(itemId, captured);

      showUndo(
        `"${item.canonical_name}" marked as expired.`,
        async () => {
          const pending = pendingPantryExpiresRef.current.get(itemId);
          if (!pending) return;
          pendingPantryExpiresRef.current.delete(itemId);
          restorePantryExpire(pending);
        },
        () => commitPantryExpire(itemId),
      );
    },
    [
      flushPendingPantryActions,
      optimisticallyExpirePantryItem,
      showUndo,
      restorePantryExpire,
      commitPantryExpire,
    ],
  );

  /** Item used up or cleared from pantry (not expired, not shopping). */
  const performRemoveFromPantry = useCallback(
    (item: PantryItem) => {
      const itemId = item.item_id;
      flushPendingPantryActions();

      const captured = optimisticallyRemovePantryItem(itemId);
      if (!captured.inventory && !captured.expiring && !captured.expired) return;

      pendingPantryRemovesRef.current.set(itemId, captured);

      showUndo(
        `"${item.canonical_name}" removed from pantry.`,
        async () => {
          const pending = pendingPantryRemovesRef.current.get(itemId);
          if (!pending) return;
          pendingPantryRemovesRef.current.delete(itemId);
          restorePantryEntries(pending);
        },
        () => commitPantryRemove(itemId),
      );
    },
    [
      flushPendingPantryActions,
      optimisticallyRemovePantryItem,
      showUndo,
      restorePantryEntries,
      commitPantryRemove,
    ],
  );

  const performAddToShopping = useCallback(
    (item: ExpiringItem) => {
      const itemId = item.item_id;
      flushPendingPantryActions();

      const captured = optimisticallyRemovePantryItem(itemId);
      if (!captured.inventory && !captured.expiring && !captured.expired) return;

      pendingPantryAddToShoppingRef.current.set(itemId, {
        ...captured,
        name: item.canonical_name,
        qty: item.qty,
        unit: item.unit,
      });

      showUndo(
        `"${item.canonical_name}" added to shopping list.`,
        async () => {
          const pending = pendingPantryAddToShoppingRef.current.get(itemId);
          if (!pending) return;
          pendingPantryAddToShoppingRef.current.delete(itemId);
          restorePantryEntries(pending);
        },
        () => commitPantryAddToShopping(itemId),
      );
    },
    [
      flushPendingPantryActions,
      optimisticallyRemovePantryItem,
      showUndo,
      restorePantryEntries,
      commitPantryAddToShopping,
    ],
  );

  const buildInStockMenu = useCallback(
    (item: PantryItem): InventoryMenuAction[] => [
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

  const handleSaveEdit = async (patch: Parameters<typeof api.updateInventoryItem>[1]) => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      await api.updateInventoryItem(editItem.item_id, patch);
      await loadData();
      const label = patch.canonical_name ?? editItem.canonical_name;
      showSnack(`"${label}" updated`);
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

  const inStockItems = useMemo((): PantryItem[] => {
    const combined: PantryItem[] = [...inventory, ...expiringItems];
    return combined.sort((a, b) => {
      const aExp = a.estimated_expiry
        ? new Date(a.estimated_expiry).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bExp = b.estimated_expiry
        ? new Date(b.estimated_expiry).getTime()
        : Number.MAX_SAFE_INTEGER;
      if (aExp !== bExp) return aExp - bExp;
      return a.canonical_name.localeCompare(b.canonical_name);
    });
  }, [inventory, expiringItems]);

  const groupMeta = useMemo(
    () => [...foodGroups].sort((a, b) => a.sort - b.sort),
    [foodGroups],
  );

  const itemGroupId = useCallback((foodGroup?: string) => {
    const raw = foodGroup || 'other';
    return raw === 'protein' ? 'non_veg' : raw;
  }, []);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of inStockItems) {
      const gid = itemGroupId(item.food_group);
      counts[gid] = (counts[gid] ?? 0) + 1;
    }
    return counts;
  }, [inStockItems, itemGroupId]);

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
    () => {
      const source = expiringSoonFilter ? expiringItems : inStockItems;
      return source
        .filter((item) => item.canonical_name.toLowerCase().includes(searchLower))
        .filter((item) => !groupFilter || itemGroupId(item.food_group) === groupFilter);
    },
    [inStockItems, expiringItems, expiringSoonFilter, searchLower, groupFilter, itemGroupId],
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
  const gridCellWidth = useMemo(() => {
    const inner = windowWidth - INVENTORY_GRID_PAD * 2 - INVENTORY_GRID_GAP * (INVENTORY_GRID_COLUMNS - 1);
    return Math.floor(inner / INVENTORY_GRID_COLUMNS);
  }, [windowWidth]);

  const gridCellStyle = useMemo(
    () => ({ width: gridCellWidth, marginBottom: INVENTORY_GRID_GAP }),
    [gridCellWidth],
  );

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
              label={`All (${inStockItems.length})`}
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
              <View style={styles.grid}>
                {filteredInventory.map((item) => (
                  <View key={item.item_id} style={gridCellStyle}>
                    <InventoryListItem
                      variant="grid"
                      kind="in_stock"
                      item={item}
                      menuActions={buildInStockMenu(item)}
                      onSwipeLeft={() => void performExpire(item)}
                      onSwipeRight={() => void performRemoveFromPantry(item)}
                    />
                  </View>
                ))}
              </View>
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
              <View style={styles.grid}>
                {filteredExpired.map((item) => (
                  <View key={item.item_id} style={gridCellStyle}>
                    <InventoryListItem
                      variant="grid"
                      kind="expired"
                      item={item}
                      menuActions={buildExpiredMenu(item)}
                      onSwipeLeft={() => void performAddToShopping(item)}
                      onSwipeRight={() => void performRemoveFromPantry(item)}
                    />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      <AddInventoryModal
        visible={addModalVisible}
        onDismiss={() => setAddModalVisible(false)}
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
        groupMeta={groupMeta}
      />

      {undoSnackbar}
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
    height: 6,
    backgroundColor: '#EBEBEB',
    marginTop: 6,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingTop: 8,
    paddingHorizontal: INVENTORY_GRID_PAD,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: INVENTORY_GRID_GAP,
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
