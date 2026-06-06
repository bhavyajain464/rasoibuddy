import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Searchbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { StockListItem } from '../components/stock/StockListItem';
import { useSectionListFilterScroll } from '../hooks/useSectionListFilterScroll';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { InventoryListPage, InventoryRow } from '../types';
import { formatFoodGroupLabel } from '../utils/foodGroup';
import { showAppError } from '../utils/alertMessage';
import { palette } from '../theme';

const STOCK_PAGE_SIZE = 10;

type StockFilter = 'all' | 'low' | string;

type StockSection = {
  key: string;
  title: string;
  data: InventoryRow[];
};

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
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
  const [error, setError] = useState('');
  const { listRef, loadMoreLockRef, handleListScroll, handleContentSizeChange, resetForFilterChange, canAutoLoadMore } =
    useSectionListFilterScroll<InventoryRow>(groupFilter, loading);

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

  const searchLower = search.trim().toLowerCase();

  const foodGroups = useMemo(
    () =>
      Object.entries(foodGroupCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ key, label: formatFoodGroupLabel(key), count })),
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
  }, [items, searchLower]);

  const listSections = useMemo(
    (): StockSection[] => [{ key: 'stock', title: '', data: filteredItems }],
    [filteredItems],
  );

  const subtitle = loading
    ? 'Loading stock…'
    : `${totalCount} items${lowStockCount > 0 ? ` · ${lowStockCount} low` : ''}`;

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
        <SectionList
          ref={listRef}
          sections={listSections}
          style={styles.list}
          keyExtractor={(item) => item.item_id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 24 },
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
            <Text style={styles.empty}>
              {searchLower || groupFilter !== 'all'
                ? 'No items match your filters'
                : 'No stock yet — inventory updates when orders are processed'}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
            ) : null
          }
          renderItem={({ item }) => <StockListItem item={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterRowWrap: { backgroundColor: palette.background },
  searchbar: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchInput: { color: palette.text, fontSize: 14 },
  loader: { marginTop: 48 },
  list: { flex: 1 },
  footerLoader: { marginVertical: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: palette.textMuted, textAlign: 'center', padding: 32 },
  error: { color: palette.error, paddingHorizontal: 16, marginBottom: 8 },
});
