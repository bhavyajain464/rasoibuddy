import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, IconButton, Searchbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { AddStockSheet } from '../components/stock/AddStockSheet';
import { StockListItem } from '../components/stock/StockListItem';
import { useIngredientCatalog } from '../hooks/useIngredientCatalog';
import { useGridFilterScroll } from '../hooks/useGridFilterScroll';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { InventoryListPage, InventoryRow } from '../types';
import { formatFoodGroupLabel, normalizeFoodGroup, STATIC_FOOD_GROUPS } from '../utils/foodGroup';
import {
  INGREDIENT_GRID_GAP,
  INGREDIENT_GRID_PAD,
  useIngredientGridCellWidth,
} from '../utils/ingredientGrid';
import { showAppError, showAppSuccess } from '../utils/alertMessage';
import { palette } from '../theme';

const STOCK_PAGE_SIZE = 50;

type StockFilter = 'all' | 'low' | string;

type StockSection = {
  key: string;
  title: string;
  data: InventoryRow[];
};

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const gridCellWidth = useIngredientGridCellWidth(windowWidth);
  const gridCellStyle = useMemo(
    () => ({ width: gridCellWidth, marginBottom: INGREDIENT_GRID_GAP }),
    [gridCellWidth],
  );
  const { kitchen } = useRestaurant();
  const kitchenId = kitchen?.kitchen_id ?? '';
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [foodGroupCounts, setFoodGroupCounts] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<StockFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { catalog } = useIngredientCatalog();
  const [error, setError] = useState('');
  const { scrollRef, loadMoreLockRef, handleListScroll, handleContentSizeChange, resetForFilterChange, canAutoLoadMore } =
    useGridFilterScroll(groupFilter, loading);

  const selectGroupFilter = useCallback(
    (filter: StockFilter) => {
      if (filter === groupFilter) return;
      resetForFilterChange();
      setLoading(true);
      setGroupFilter(filter);
    },
    [groupFilter, resetForFilterChange],
  );

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      if (!kitchenId) return;
      setError('');
      const params = new URLSearchParams({ limit: String(STOCK_PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (groupFilter === 'low') {
        params.set('low', 'true');
      } else if (groupFilter !== 'all') {
        params.set('food_group', groupFilter);
      }
      const page = await restaurantFetch<InventoryListPage>(
        `/restaurant/${kitchenId}/inventory?${params.toString()}`,
      );
      setTotalCount(page.total_count ?? 0);
      setLowStockCount(page.low_stock_count ?? 0);
      setFoodGroupCounts(page.food_group_counts ?? {});
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setItems((prev) => (append ? [...prev, ...(page.items ?? [])] : (page.items ?? [])));
    },
    [kitchenId, groupFilter],
  );

  useEffect(() => {
    setLoading(true);
    fetchPage()
      .catch((e) => {
        setItems([]);
        setError(e instanceof Error ? e.message : 'Failed to load stock');
      })
      .finally(() => setLoading(false));
  }, [fetchPage]);

  const reloadOnFocus = useCallback(() => {
    fetchPage().catch((e) => {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Failed to load stock');
    });
  }, [fetchPage]);

  useRefreshOnFocus(reloadOnFocus, { enabled: Boolean(kitchenId) });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock');
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
      showAppError('Could not load more stock items');
    } finally {
      setLoadingMore(false);
      loadMoreLockRef.current = false;
    }
  };

  const handleAdd = async (rows: { name: string; qty: number; unit: string; food_group?: string }[]) => {
    if (!kitchenId || !rows.length) return;
    try {
      for (const payload of rows) {
        await restaurantFetch<InventoryRow>(`/restaurant/${kitchenId}/inventory`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      showAppSuccess(
        rows.length === 1 ? `Added ${rows[0].name} to stock` : `Added ${rows.length} items to stock`,
      );
      setSearch('');
      setGroupFilter('all');
      resetForFilterChange();
      setLoading(true);
      const params = new URLSearchParams({ limit: String(STOCK_PAGE_SIZE) });
      const page = await restaurantFetch<InventoryListPage>(
        `/restaurant/${kitchenId}/inventory?${params.toString()}`,
      );
      setTotalCount(page.total_count ?? 0);
      setLowStockCount(page.low_stock_count ?? 0);
      setFoodGroupCounts(page.food_group_counts ?? {});
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setItems(page.items ?? []);
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not add stock items');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const searchLower = search.trim().toLowerCase();

  const foodGroups = useMemo(
    () =>
      STATIC_FOOD_GROUPS.map((key) => ({
        key,
        label: formatFoodGroupLabel(key),
        count: foodGroupCounts[key] ?? 0,
      })).filter((group) => group.count > 0),
    [foodGroupCounts],
  );

  useEffect(() => {
    if (groupFilter === 'all' || groupFilter === 'low' || foodGroups.some((g) => g.key === groupFilter)) {
      return;
    }
    selectGroupFilter('all');
  }, [groupFilter, foodGroups, selectGroupFilter]);

  const filteredItems = useMemo(() => {
    const base = !searchLower
      ? items
      : items.filter((item) => {
          const name = item.canonical_name.toLowerCase();
          const group = formatFoodGroupLabel(item.food_group).toLowerCase();
          return name.includes(searchLower) || group.includes(searchLower);
        });
    return [...base].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
  }, [items, searchLower, groupFilter]);

  const listSections = useMemo(
    (): StockSection[] => [{ key: String(groupFilter), title: '', data: filteredItems }],
    [filteredItems, groupFilter],
  );

  const subtitle = loading
    ? 'Loading stock…'
    : `${totalCount} items${lowStockCount > 0 ? ` · ${lowStockCount} low` : ''}`;

  const tryLoadMore = useCallback(
    (event: Parameters<typeof handleListScroll>[0]) => {
      handleListScroll(event);
      if (!canAutoLoadMore() || loading || loadingMore || !hasMore) return;
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y < contentSize.height - 240) return;
      void loadMore();
    },
    [canAutoLoadMore, handleListScroll, hasMore, loadMore, loading, loadingMore],
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="Stock" subtitle={subtitle} />

      <View style={styles.toolbar}>
        <Searchbar
          placeholder="Search items or groups…"
          value={search}
          onChangeText={setSearch}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor={palette.primary}
          placeholderTextColor={palette.textMuted}
          elevation={0}
        />
        <IconButton
          icon="plus"
          mode="contained"
          containerColor={palette.primary}
          iconColor="#0F172A"
          size={20}
          onPress={() => setSheetOpen(true)}
          style={styles.addBtn}
          accessibilityLabel="Add stock item"
        />
      </View>

      {totalCount > 0 ? (
        <View style={styles.filterRowWrap}>
          <FilterPillRow>
            <FilterPill
              label={`All (${totalCount})`}
              selected={groupFilter === 'all'}
              onPress={() => selectGroupFilter('all')}
            />
            {lowStockCount > 0 ? (
              <FilterPill
                label={`Low (${lowStockCount})`}
                selected={groupFilter === 'low'}
                onPress={() => selectGroupFilter('low')}
              />
            ) : null}
            {foodGroups.map((group) => (
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
          }
          onScroll={tryLoadMore}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {filteredItems.length === 0 ? (
            <Text style={styles.empty}>
              {searchLower || groupFilter !== 'all'
                ? 'No items match your filters'
                : 'No stock yet — tap + to add items or import from menu seed'}
            </Text>
          ) : (
            listSections.map((section) => (
              <View key={section.key}>
                {section.title ? (
                  <Text variant="titleSmall" style={styles.sectionHeader}>
                    {section.title}
                  </Text>
                ) : null}
                <View style={styles.grid}>
                  {section.data.map((item) => (
                    <View key={item.item_id} style={gridCellStyle}>
                      <StockListItem item={item} variant="grid" />
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
          {loadingMore ? (
            <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
          ) : null}
        </ScrollView>
      )}

      <AddStockSheet
        visible={sheetOpen}
        catalog={catalog}
        onDismiss={() => setSheetOpen(false)}
        onSave={handleAdd}
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
    paddingTop: 8,
    paddingBottom: 2,
    gap: 6,
  },
  addBtn: { margin: 0, width: 40, height: 40 },
  filterRowWrap: { backgroundColor: palette.background, overflow: 'visible', zIndex: 2 },
  searchbar: {
    flex: 1,
    minWidth: 0,
    height: 40,
    minHeight: 40,
    backgroundColor: palette.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchInput: {
    color: palette.text,
    fontSize: 14,
    minHeight: 0,
    height: 40,
    paddingVertical: 0,
    marginVertical: 0,
  },
  loader: { marginTop: 48 },
  list: { flex: 1 },
  footerLoader: { marginVertical: 16 },
  listContent: {
    paddingHorizontal: INGREDIENT_GRID_PAD,
    paddingTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: INGREDIENT_GRID_GAP,
  },
  sectionHeader: {
    color: palette.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: palette.textMuted, textAlign: 'center', padding: 32 },
  error: { color: palette.error, paddingHorizontal: 16, marginBottom: 8 },
});
