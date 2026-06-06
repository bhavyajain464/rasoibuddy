import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { ActivityIndicator, IconButton, Menu, Searchbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { EditMenuItemSheet, IngredientDraft } from '../components/menu/EditMenuItemSheet';
import { MenuListItem } from '../components/menu/MenuListItem';
import { useSectionListFilterScroll } from '../hooks/useSectionListFilterScroll';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { InventoryRow, InventoryListPage, MenuItem, MenuListPage, RecipeIngredient } from '../types';
import { showAppError } from '../utils/alertMessage';
import { palette } from '../theme';

const MENU_PAGE_SIZE = 10;

function formatCategoryLabel(category: string): string {
  const raw = category.trim() || 'general';
  return raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase() || 'general';
}

async function confirmDelete(name: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return window.confirm(`Remove "${name}" from the menu?`);
  }
  return new Promise((resolve) => {
    Alert.alert('Remove dish', `Remove "${name}" from the menu?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { kitchen } = useRestaurant();
  const kitchenId = kitchen?.kitchen_id ?? '';
  const [items, setItems] = useState<MenuItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [ingredientsByItem, setIngredientsByItem] = useState<Record<string, RecipeIngredient[]>>({});
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const fetchGenRef = useRef(0);
  const filterKey = groupFilter ?? 'all';
  const listMountKey = `menu-${filterKey}-${loading ? 'loading' : 'ready'}`;
  const {
    listRef,
    loadMoreLockRef,
    handleListScroll,
    handleContentSizeChange,
    resetForFilterChange,
    canAutoLoadMore,
  } = useSectionListFilterScroll<MenuItem>(filterKey, loading);

  const selectGroupFilter = useCallback(
    (filter: string | null) => {
      if (filter === groupFilter) return;
      resetForFilterChange();
      setItems([]);
      setIngredientsByItem({});
      setLoading(true);
      setGroupFilter(filter);
    },
    [groupFilter, resetForFilterChange],
  );

  const fetchPage = useCallback(
    async (cursor?: string, append = false, gen?: number) => {
      if (!kitchenId) return;
      const params = new URLSearchParams({
        limit: String(MENU_PAGE_SIZE),
        active: 'true',
        include: 'ingredients',
      });
      if (cursor) params.set('cursor', cursor);
      if (groupFilter) params.set('category', groupFilter);
      const page = await restaurantFetch<MenuListPage>(
        `/restaurant/${kitchenId}/menu?${params.toString()}`,
      );
      if (!append && gen != null && gen !== fetchGenRef.current) return;

      const nextItems = page.items ?? [];
      const ingredientPatch = page.ingredients_by_item ?? {};

      setTotalCount(page.total_count ?? 0);
      setCategoryCounts(page.category_counts ?? {});
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setIngredientsByItem((prev) => (append ? { ...prev, ...ingredientPatch } : ingredientPatch));
    },
    [kitchenId, groupFilter],
  );

  const loadInventory = useCallback(async () => {
    if (!kitchenId) return;
    const page = await restaurantFetch<InventoryListPage>(
      `/restaurant/${kitchenId}/inventory?limit=100`,
    ).catch(() => ({ items: [] }));
    setInventory(page.items ?? []);
  }, [kitchenId]);

  useEffect(() => {
    if (!kitchenId) return;
    void loadInventory();
  }, [kitchenId, loadInventory]);

  useEffect(() => {
    const gen = ++fetchGenRef.current;
    setLoading(true);

    fetchPage(undefined, false, gen)
      .catch(() => {
        if (gen !== fetchGenRef.current) return;
        setItems([]);
        setIngredientsByItem({});
      })
      .finally(() => {
        if (gen !== fetchGenRef.current) return;
        setLoading(false);
        setHasLoadedOnce(true);
      });
  }, [fetchPage]);

  useEffect(() => {
    if (!groupFilter || categoryCounts[groupFilter] != null) return;
    setItems([]);
    setIngredientsByItem({});
    setGroupFilter(null);
  }, [groupFilter, categoryCounts]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchPage(), loadInventory()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (loadMoreLockRef.current || !hasMore || loadingMore || loading || !nextCursor) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor, true);
    } catch {
      showAppError('Could not load more dishes');
    } finally {
      setLoadingMore(false);
      loadMoreLockRef.current = false;
    }
  };

  const searchLower = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!searchLower) return items;
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(searchLower)) return true;
      const ings = ingredientsByItem[item.menu_item_id] ?? [];
      return ings.some((ing) => ing.ingredient_name.toLowerCase().includes(searchLower));
    });
  }, [items, ingredientsByItem, searchLower]);

  const categoryGroups = useMemo(
    () =>
      Object.entries(categoryCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ key, label: formatCategoryLabel(key), count })),
    [categoryCounts],
  );

  const categoryOptions = useMemo(() => {
    const keys = new Set(categoryGroups.map((g) => g.key));
    for (const item of items) {
      keys.add(normalizeCategory(item.category));
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [categoryGroups, items]);

  const openAdd = () => {
    setEditingItem(null);
    setSheetOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingItem(null);
  };

  const handleSave = async (payload: {
    name: string;
    category: string;
    ingredients: IngredientDraft[];
  }) => {
    if (!kitchenId || !payload.name) return;
    setSaving(true);
    try {
      const saved = await restaurantFetch<MenuItem>(`/restaurant/${kitchenId}/menu`, {
        method: 'POST',
        body: JSON.stringify({
          menu_item_id: editingItem?.menu_item_id,
          name: payload.name,
          price_cents: editingItem?.price_cents ?? 0,
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
      const ings = await restaurantFetch<RecipeIngredient[]>(
        `/restaurant/${kitchenId}/menu/${saved.menu_item_id}/ingredients`,
        {
          method: 'PUT',
          body: JSON.stringify(recipePayload),
        },
      );
      setIngredientsByItem((prev) => ({ ...prev, [saved.menu_item_id]: ings ?? [] }));
      if (editingItem) {
        setItems((prev) => prev.map((i) => (i.menu_item_id === saved.menu_item_id ? saved : i)));
      } else {
        setItems((prev) => [...prev, saved]);
        setTotalCount((n) => n + 1);
        const catKey = normalizeCategory(saved.category);
        setCategoryCounts((prev) => ({ ...prev, [catKey]: (prev[catKey] ?? 0) + 1 }));
      }
      closeSheet();
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not save dish');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    if (!kitchenId) return;
    const ok = await confirmDelete(item.name);
    if (!ok) return;
    try {
      await restaurantFetch(`/restaurant/${kitchenId}/menu`, {
        method: 'POST',
        body: JSON.stringify({
          menu_item_id: item.menu_item_id,
          name: item.name,
          price_cents: item.price_cents,
          category: item.category,
          is_active: false,
        }),
      });
      setItems((prev) => prev.filter((i) => i.menu_item_id !== item.menu_item_id));
      setTotalCount((n) => Math.max(0, n - 1));
      const catKey = normalizeCategory(item.category);
      setCategoryCounts((prev) => ({
        ...prev,
        [catKey]: Math.max(0, (prev[catKey] ?? 1) - 1),
      }));
      setIngredientsByItem((prev) => {
        const next = { ...prev };
        delete next[item.menu_item_id];
        return next;
      });
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not remove dish');
    }
  };

  const seedCatalog = async () => {
    setAddMenuOpen(false);
    setSeeding(true);
    try {
      await restaurantFetch(`/restaurant/${kitchenId}/menu/seed-catalog`, {
        method: 'POST',
        body: '{}',
      });
      await fetchPage();
    } catch {
      showAppError('Could not import catalog dishes');
    } finally {
      setSeeding(false);
    }
  };

  const editingIngredients = editingItem
    ? ingredientsByItem[editingItem.menu_item_id] ?? []
    : [];

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Menu"
        subtitle={
          loading
            ? 'Loading dishes…'
            : `${totalCount} dish${totalCount === 1 ? '' : 'es'} · link ingredients for orders`
        }
      />

      <View style={styles.toolbar}>
        <Searchbar
          placeholder="Search dishes or ingredients…"
          value={search}
          onChangeText={setSearch}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor={palette.primary}
          placeholderTextColor={palette.textMuted}
          elevation={0}
        />
        <Menu
          visible={addMenuOpen}
          onDismiss={() => setAddMenuOpen(false)}
          anchor={
            <IconButton
              icon="plus"
              mode="contained"
              containerColor={palette.primary}
              iconColor="#0F172A"
              size={22}
              loading={seeding}
              onPress={() => setAddMenuOpen(true)}
              style={styles.addBtn}
              accessibilityLabel="Add menu item"
            />
          }
          anchorPosition="bottom"
        >
          <Menu.Item
            leadingIcon="food"
            title="Add dish"
            onPress={() => {
              setAddMenuOpen(false);
              openAdd();
            }}
          />
          <Menu.Item
            leadingIcon="download"
            title="Import from catalog"
            onPress={seedCatalog}
          />
        </Menu>
      </View>

      {totalCount > 0 ? (
        <View style={styles.filterRowWrap}>
          <FilterPillRow>
            <FilterPill
              label={`All (${totalCount})`}
              selected={groupFilter === null}
              onPress={() => selectGroupFilter(null)}
            />
            {categoryGroups.map((group) => (
              <FilterPill
                key={group.key}
                label={`${group.label} (${group.count})`}
                selected={groupFilter === group.key}
                onPress={() => selectGroupFilter(group.key)}
              />
            ))}
          </FilterPillRow>
        </View>
      ) : null}

      {loading && !hasLoadedOnce ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : (
        <SectionList
          key={listMountKey}
          ref={listRef}
          sections={[{ key: filterKey, title: '', data: filteredItems }]}
          style={styles.list}
          scrollEnabled={!loading}
          keyExtractor={(item) => item.menu_item_id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 24 },
            Platform.OS === 'web' ? ({ overflowAnchor: 'none' } as const) : null,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
          }
          onScroll={handleListScroll}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={16}
          onEndReached={() => {
            if (!canAutoLoadMore() || loading || loadingMore || !hasMore) return;
            void loadMore();
          }}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
            ) : (
              <Text style={styles.empty}>
                {searchLower || groupFilter
                  ? 'No dishes match your filters'
                  : 'No menu items — tap + to add a dish'}
              </Text>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
            ) : null
          }
          renderItem={({ item }) => (
            <MenuListItem
              item={item}
              ingredients={ingredientsByItem[item.menu_item_id] ?? []}
              onPress={() => openEdit(item)}
              menuActions={[
                {
                  key: 'edit',
                  label: 'Edit dish',
                  icon: 'pencil-outline',
                  onPress: () => openEdit(item),
                },
                {
                  key: 'delete',
                  label: 'Remove from menu',
                  icon: 'delete-outline',
                  destructive: true,
                  onPress: () => handleDelete(item),
                },
              ]}
            />
          )}
        />
      )}

      <EditMenuItemSheet
        visible={sheetOpen}
        item={editingItem}
        ingredients={editingIngredients}
        inventory={inventory}
        categoryOptions={categoryOptions}
        saving={saving}
        onDismiss={closeSheet}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterRowWrap: {
    backgroundColor: palette.background,
  },
  searchbar: {
    flex: 1,
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchInput: { color: palette.text, fontSize: 14 },
  addBtn: { margin: 0 },
  loader: { marginTop: 48 },
  list: { flex: 1 },
  footerLoader: { marginVertical: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: palette.textMuted, textAlign: 'center', padding: 32 },
});
