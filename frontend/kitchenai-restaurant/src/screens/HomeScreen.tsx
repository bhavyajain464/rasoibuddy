import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ActivityIndicator, Icon, Surface, Text } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditMenuItemSheet, IngredientDraft } from '../components/menu/EditMenuItemSheet';
import OrderDetailSheet from '../components/OrderDetailSheet';
import { PendingOrdersPanel } from '../components/PendingOrdersPanel';
import { ProfileHeaderButton } from '../components/ProfileHeaderButton';
import { QuickActionsCarousel } from '../components/QuickActionsCarousel';
import { AddShoppingSheet } from '../components/shopping/AddShoppingSheet';
import { openProfile } from '../navigation/rootNavigation';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { InventoryListPage, InventoryRow, MenuItem, MenuListPage, Order, OrderListPage, RecipeIngredient, ShoppingRow } from '../types';
import { showAppError, showAppSuccess } from '../utils/alertMessage';
import { palette } from '../theme';

type ZomatoStatus = {
  status: string;
  last_sync_at?: string;
  last_error?: string;
  last_sync_message?: string;
  last_sync_ok?: boolean;
  orders_imported_count?: number;
  poll_interval_minutes?: number;
  next_poll_at?: string;
  session_saved?: boolean;
  outlet_id?: string;
  outlet_name?: string;
};

type HomeSummary = {
  kitchenName: string;
  orders: Order[];
  inventory: InventoryRow[];
  shopping: ShoppingRow[];
  menuItems: MenuItem[];
  menuCount: number;
  zomato: ZomatoStatus | null;
};

const LOW_STOCK_MAX = 1;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function zomatoStatusLabel(st: ZomatoStatus | null): string {
  if (!st) return 'Not configured';
  if (st.status === 'running') return 'Syncing';
  if (st.status === 'login_required') return 'Reconnect needed';
  if (st.status === 'error') return 'Sync error';
  if (st.session_saved) return 'Connected — idle';
  return 'Not connected';
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { kitchen } = useRestaurant();
  const kitchenId = kitchen?.kitchen_id ?? '';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const [buySheetOpen, setBuySheetOpen] = useState(false);
  const [savingMenu, setSavingMenu] = useState(false);
  const [savingBuy, setSavingBuy] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!kitchenId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const [kitchenRes, orders, inventory, shoppingRes, menu, zomato] = await Promise.all([
        restaurantFetch<{ name?: string }>(`/restaurant/${kitchenId}`).catch(() => ({ name: '' })),
        restaurantFetch<OrderListPage>(`/restaurant/${kitchenId}/orders?limit=50`)
          .then((page) => page.orders ?? [])
          .catch(() => []),
        restaurantFetch<InventoryListPage>(`/restaurant/${kitchenId}/inventory?limit=100`)
          .then((page) => page.items ?? [])
          .catch(() => []),
        restaurantFetch<{ items: ShoppingRow[] }>(`/restaurant/${kitchenId}/shopping`).catch(() => ({ items: [] })),
        restaurantFetch<MenuListPage>(`/restaurant/${kitchenId}/menu?active=true&limit=50`)
          .then((page) => page.items ?? [])
          .catch(() => []),
        restaurantFetch<ZomatoStatus>(`/restaurant/${kitchenId}/integrations/zomato/status`).catch(() => null),
      ]);
      const menuList = Array.isArray(menu) ? menu : [];
      setSummary({
        kitchenName: kitchenRes?.name?.trim() || 'Your restaurant',
        orders: orders ?? [],
        inventory: inventory ?? [],
        shopping: shoppingRes?.items ?? [],
        menuItems: menuList,
        menuCount: menuList.length,
        zomato: zomato,
      });
    } finally {
      setLoading(false);
    }
  }, [kitchenId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? 'Partner';
  const orders = summary?.orders ?? [];
  const inProcessOrders = orders.filter((o) => o.status === 'in_process' || o.status === 'open');
  const lowStock = (summary?.inventory ?? []).filter((i) => i.qty <= LOW_STOCK_MAX);
  const zomato = summary?.zomato ?? null;
  const zomatoRunning = zomato?.status === 'running';
  const zomatoNeedsAttention =
    zomato?.status === 'error' ||
    zomato?.status === 'login_required' ||
    (!zomatoRunning && zomato?.session_saved && zomato?.status === 'idle');

  const navigateTab = (tab: 'Orders' | 'Stock' | 'Menu' | 'Buy') => {
    navigation.navigate(tab);
  };

  const handleAddDish = async (payload: {
    name: string;
    category: string;
    ingredients: IngredientDraft[];
  }) => {
    if (!kitchenId) return;
    setSavingMenu(true);
    try {
      const saved = await restaurantFetch<MenuItem>(`/restaurant/${kitchenId}/menu`, {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          price_cents: 0,
          category: payload.category,
          is_active: true,
        }),
      });
      const recipePayload = payload.ingredients
        .filter((d) => d.ingredient_name.trim() && parseFloat(d.qty) > 0)
        .map((d, i) => ({
          ingredient_name: d.ingredient_name.trim(),
          qty: parseFloat(d.qty) || 1,
          unit: d.unit.trim() || 'g',
          inventory_item_id: d.inventory_item_id || undefined,
          sort_order: i + 1,
        }));
      if (recipePayload.length > 0) {
        await restaurantFetch<RecipeIngredient[]>(`/restaurant/${kitchenId}/menu/${saved.menu_item_id}/ingredients`, {
          method: 'PUT',
          body: JSON.stringify(recipePayload),
        });
      }
      setMenuSheetOpen(false);
      showAppSuccess(`Added "${saved.name}" to menu`);
      void load();
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not save dish');
    } finally {
      setSavingMenu(false);
    }
  };

  const handleAddToBuyList = async (payload: { name: string; qty: number; unit: string }) => {
    if (!kitchenId) return;
    setSavingBuy(true);
    try {
      await restaurantFetch<ShoppingRow>(`/restaurant/${kitchenId}/shopping`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setBuySheetOpen(false);
      showAppSuccess(`Added "${payload.name}" to buy list`);
      void load();
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not add item');
    } finally {
      setSavingBuy(false);
    }
  };

  const menuCategories = [...new Set((summary?.menuItems ?? []).map((m) => m.category?.trim().toLowerCase() || 'general'))];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text variant="bodyMedium" style={styles.greeting}>
              {getGreeting()},
            </Text>
            <Text variant="headlineMedium" style={styles.heroName}>
              {firstName}
            </Text>
            <Text variant="bodySmall" style={styles.headerSub}>
              {summary?.kitchenName ?? '…'}
              {zomato?.outlet_id ? ` · Outlet ${zomato.outlet_id}` : ''}
            </Text>
          </View>
          <ProfileHeaderButton size={44} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} size="large" />
      ) : (
        <>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Quick actions
          </Text>
          <QuickActionsCarousel
            onAddDish={() => setMenuSheetOpen(true)}
            onAddToBuyList={() => setBuySheetOpen(true)}
          />

          <Text variant="titleMedium" style={styles.sectionTitle}>
            Zomato sync
          </Text>
          <Pressable
            onPress={() => openProfile()}
            style={({ pressed }) => [styles.zomatoCardWrap, pressed && styles.pressed]}
          >
            <Surface
              style={[
                styles.zomatoCard,
                zomatoRunning && styles.zomatoCardOk,
                zomato?.status === 'error' && styles.zomatoCardErr,
                zomatoNeedsAttention && !zomatoRunning && styles.zomatoCardWarn,
              ]}
              elevation={0}
            >
              <View style={styles.zomatoCardTop}>
                <Icon
                  source={zomatoRunning ? 'sync' : 'cloud-sync-outline'}
                  size={22}
                  color={zomatoRunning ? palette.success : palette.primary}
                />
                <Text variant="titleSmall" style={styles.zomatoTitle}>
                  {zomatoStatusLabel(zomato)}
                </Text>
              </View>
              {zomato?.outlet_name ? (
                <Text style={styles.zomatoMeta}>{zomato.outlet_name}</Text>
              ) : null}
              {zomato?.last_sync_message ? (
                <Text style={styles.zomatoMsg} numberOfLines={2}>
                  {zomato.last_sync_message}
                </Text>
              ) : zomato?.last_error ? (
                <Text style={styles.zomatoErr} numberOfLines={2}>
                  {zomato.last_error}
                </Text>
              ) : zomatoRunning && zomato.next_poll_at ? (
                <Text style={styles.zomatoMeta}>
                  Next poll {new Date(zomato.next_poll_at).toLocaleTimeString()}
                </Text>
              ) : (
                <Text style={styles.zomatoMeta}>Tap to manage in Profile</Text>
              )}
            </Surface>
          </Pressable>

          {orders.length > 0 ? (
            <PendingOrdersPanel
              orders={inProcessOrders}
              expanded={ordersExpanded}
              onToggle={() => setOrdersExpanded((v) => !v)}
              onOrderPress={setSelectedOrderId}
              onViewAll={() => navigateTab('Orders')}
            />
          ) : (
            <Pressable
              onPress={() => openProfile()}
              style={({ pressed }) => [styles.emptyOrdersWrap, pressed && styles.pressed]}
            >
              <Surface style={styles.emptyCard} elevation={0}>
                <Icon source="clipboard-text-outline" size={32} color={palette.textMuted} />
                <Text variant="titleSmall" style={styles.emptyTitle}>
                  No orders yet
                </Text>
                <Text variant="bodySmall" style={styles.emptySub}>
                  Connect Zomato in Profile to import orders
                </Text>
              </Surface>
            </Pressable>
          )}

          {lowStock.length > 0 ? (
            <>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Low stock
              </Text>
              <Surface style={styles.panel} elevation={0}>
                {lowStock.slice(0, 4).map((item, index, preview) => (
                  <Pressable
                    key={item.item_id}
                    onPress={() => navigateTab('Stock')}
                    style={({ pressed }) => [
                      styles.panelRow,
                      index < preview.length - 1 && styles.panelRowBorder,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.panelRowName} numberOfLines={1}>
                      {item.canonical_name}
                    </Text>
                    <Text style={styles.panelRowMeta}>
                      {item.qty} {item.unit}
                    </Text>
                  </Pressable>
                ))}
                {lowStock.length > 4 ? (
                  <Pressable onPress={() => navigateTab('Stock')} style={styles.panelMore}>
                    <Text style={styles.panelMoreText}>+{lowStock.length - 4} more in Stock</Text>
                  </Pressable>
                ) : null}
              </Surface>
            </>
          ) : null}
        </>
      )}

      <OrderDetailSheet
        visible={selectedOrderId != null}
        orderId={selectedOrderId}
        kitchenId={kitchenId}
        onClose={() => setSelectedOrderId(null)}
      />

      <EditMenuItemSheet
        visible={menuSheetOpen}
        item={null}
        ingredients={[]}
        inventory={summary?.inventory ?? []}
        categoryOptions={menuCategories}
        saving={savingMenu}
        onDismiss={() => setMenuSheetOpen(false)}
        onSave={handleAddDish}
      />

      <AddShoppingSheet
        visible={buySheetOpen}
        saving={savingBuy}
        onDismiss={() => setBuySheetOpen(false)}
        onSave={handleAddToBuyList}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  scrollContent: { paddingBottom: 24 },
  header: {
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  greeting: { color: palette.textMuted, fontSize: 15 },
  heroName: { color: palette.text, fontWeight: '800', marginTop: 4 },
  headerSub: { color: palette.textMuted, marginTop: 8 },
  loader: { marginTop: 48 },
  sectionTitle: {
    color: palette.text,
    fontWeight: '700',
    marginLeft: 20,
    marginTop: 22,
    marginBottom: 8,
  },
  sectionTitleInline: { marginLeft: 0, marginTop: 0, marginBottom: 0 },
  zomatoCardWrap: { marginHorizontal: 16 },
  zomatoCard: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  zomatoCardOk: { borderColor: 'rgba(34, 197, 94, 0.45)' },
  zomatoCardWarn: { borderColor: 'rgba(245, 158, 11, 0.55)' },
  zomatoCardErr: { borderColor: 'rgba(239, 68, 68, 0.55)' },
  zomatoCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zomatoTitle: { color: palette.text, fontWeight: '700' },
  zomatoMeta: { color: palette.textMuted, fontSize: 13, marginTop: 8 },
  zomatoMsg: { color: palette.success, fontSize: 13, marginTop: 8, lineHeight: 18 },
  zomatoErr: { color: palette.error, fontSize: 13, marginTop: 8, lineHeight: 18 },
  panel: {
    marginHorizontal: 16,
    backgroundColor: palette.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  panelRowBorder: { borderBottomWidth: 1, borderBottomColor: palette.border },
  panelRowName: { color: palette.text, flex: 1, paddingRight: 12, fontSize: 15 },
  panelRowMeta: { color: palette.error, fontWeight: '600', fontSize: 13 },
  panelMore: { padding: 12, alignItems: 'center' },
  panelMoreText: { color: palette.primary, fontWeight: '600', fontSize: 13 },
  emptyOrdersWrap: { marginHorizontal: 16, marginTop: 14 },
  emptyCard: {
    marginHorizontal: 16,
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: { color: palette.text, marginTop: 12, fontWeight: '700' },
  emptySub: { color: palette.textMuted, marginTop: 6, textAlign: 'center' },
  pressed: { opacity: 0.88 },
});
