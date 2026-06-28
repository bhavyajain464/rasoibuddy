import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View, Pressable } from 'react-native';
import { Button, Chip, Searchbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OrderDetailSheet from '../components/OrderDetailSheet';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { ScreenHeader } from '../components/ScreenHeader';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import { useSectionListFilterScroll } from '../hooks/useSectionListFilterScroll';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { Order, OrderListPage, OrderStatusCounts } from '../types';
import { palette } from '../theme';
import { showAppError, showAppInfo, showAppSuccess } from '../utils/alertMessage';
import {
  canProcessOrder,
  formatWhen,
  itemsSummary,
  orderChipBase,
  orderDisplayId,
  sourceLabel,
  statusChipStyle,
  statusLabel,
  sortOrdersNewestFirst,
} from '../utils/orderDisplay';

type StatusFilter = 'all' | 'in_process' | 'processed' | 'open' | 'void';

const ORDERS_PAGE_SIZE = 10;

const EMPTY_STATUS_COUNTS: OrderStatusCounts = {
  all: 0,
  in_process: 0,
  processed: 0,
  open: 0,
  void: 0,
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { kitchen } = useRestaurant();
  const kitchenId = kitchen?.kitchen_id ?? '';
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusCounts, setStatusCounts] = useState<OrderStatusCounts>(EMPTY_STATUS_COUNTS);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processingAll, setProcessingAll] = useState(false);
  const { listRef, loadMoreLockRef, handleListScroll, handleContentSizeChange, resetForFilterChange, canAutoLoadMore } =
    useSectionListFilterScroll<Order>(statusFilter, loading);

  const selectStatusFilter = useCallback(
    (filter: StatusFilter) => {
      if (filter === statusFilter) return;
      resetForFilterChange();
      setLoading(true);
      setStatusFilter(filter);
    },
    [statusFilter, resetForFilterChange],
  );

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      if (!kitchenId) return;
      setError('');
      const params = new URLSearchParams({ limit: String(ORDERS_PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const page = await restaurantFetch<OrderListPage>(
        `/restaurant/${kitchenId}/orders?${params.toString()}`,
      );
      setStatusCounts(page.status_counts ?? EMPTY_STATUS_COUNTS);
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setOrders((prev) =>
        append
          ? sortOrdersNewestFirst([...prev, ...(page.orders ?? [])])
          : (page.orders ?? []),
      );
    },
    [kitchenId, statusFilter],
  );

  useEffect(() => {
    setLoading(true);
    fetchPage()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load orders'))
      .finally(() => setLoading(false));
  }, [fetchPage]);

  const reloadOnFocus = useCallback(() => {
    fetchPage().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load orders'));
  }, [fetchPage]);

  useRefreshOnFocus(reloadOnFocus, { enabled: Boolean(kitchenId) });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more orders');
    } finally {
      setLoadingMore(false);
      loadMoreLockRef.current = false;
    }
  };

  const searchLower = search.trim().toLowerCase();

  const filteredOrders = useMemo(() => {
    if (!searchLower) return orders;
    return orders.filter((o) => {
      const id = orderDisplayId(o).toLowerCase();
      const summary = itemsSummary(o).toLowerCase();
      return id.includes(searchLower) || summary.includes(searchLower);
    });
  }, [orders, searchLower]);

  const handleOrderUpdated = useCallback((updated: Order) => {
    setOrders((prev) => {
      const old = prev.find((o) => o.order_id === updated.order_id);
      if (old && old.status !== updated.status) {
        setStatusCounts((counts) => {
          const next = { ...counts };
          const dec = (key: keyof OrderStatusCounts) => {
            next[key] = Math.max(0, next[key] - 1);
          };
          const inc = (key: keyof OrderStatusCounts) => {
            next[key] += 1;
          };
          if (old.status === 'in_process') dec('in_process');
          else if (old.status === 'open') dec('open');
          else if (old.status === 'processed' || old.status === 'completed') dec('processed');
          else if (old.status === 'void') dec('void');
          if (updated.status === 'in_process') inc('in_process');
          else if (updated.status === 'open') inc('open');
          else if (updated.status === 'processed' || updated.status === 'completed') inc('processed');
          else if (updated.status === 'void') inc('void');
          return next;
        });
      }
      return sortOrdersNewestFirst(prev.map((o) => (o.order_id === updated.order_id ? updated : o)));
    });
  }, []);

  const pendingCount = statusCounts.in_process + statusCounts.open;

  const fetchAllProcessable = useCallback(async (): Promise<Order[]> => {
    const [inProcessPage, openPage] = await Promise.all([
      restaurantFetch<OrderListPage>(`/restaurant/${kitchenId}/orders?status=in_process&limit=100`),
      restaurantFetch<OrderListPage>(`/restaurant/${kitchenId}/orders?status=open&limit=100`),
    ]);
    return sortOrdersNewestFirst([
      ...(inProcessPage.orders ?? []),
      ...(openPage.orders ?? []),
    ]);
  }, [kitchenId]);

  const handleProcessAll = async () => {
    if (!kitchenId || processingAll || pendingCount === 0) return;
    setProcessingAll(true);
    let processed = 0;
    let failed = 0;
    let firstError = '';
    try {
      const processableOrders = await fetchAllProcessable();
      for (const order of processableOrders) {
        if (!canProcessOrder(order.status)) continue;
        try {
          const updated = await restaurantFetch<Order>(
            `/restaurant/${kitchenId}/orders/${order.order_id}/process`,
            { method: 'POST', body: '{}' },
          );
          handleOrderUpdated(updated);
          processed += 1;
        } catch (e) {
          failed += 1;
          if (!firstError) {
            firstError = e instanceof Error ? e.message : 'Could not process order';
          }
        }
      }
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not load pending orders');
      setProcessingAll(false);
      return;
    }
    setProcessingAll(false);
    if (processed > 0 && failed === 0) {
      showAppSuccess(
        `Processed ${processed} order${processed === 1 ? '' : 's'} — stock deducted.`,
      );
    } else if (processed > 0) {
      showAppInfo(
        `Processed ${processed}, ${failed} failed. ${firstError}`,
        'Partial success',
      );
    } else {
      showAppError(firstError || 'Could not process orders');
    }
  };

  const subtitle = loading
    ? 'Loading orders…'
    : `${statusCounts.all} order${statusCounts.all === 1 ? '' : 's'} · stock deducts when processed`;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Orders" subtitle={subtitle} />

      <View style={styles.toolbar}>
        <Searchbar
          placeholder="Search order ID or items…"
          value={search}
          onChangeText={setSearch}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor={palette.primary}
          placeholderTextColor={palette.textMuted}
          elevation={0}
        />
        {pendingCount > 0 ? (
          <Button
            mode="contained"
            compact
            icon="check-decagram"
            loading={processingAll}
            disabled={processingAll}
            onPress={() => void handleProcessAll()}
            style={styles.processAllBtn}
            buttonColor={palette.primary}
            textColor="#0F172A"
            accessibilityLabel={`Process all ${pendingCount} pending orders`}
          >
            Process all
          </Button>
        ) : null}
      </View>

      {statusCounts.all > 0 ? (
        <View style={styles.filterRowWrap}>
          <FilterPillRow>
            <FilterPill
              label={`All (${statusCounts.all})`}
              selected={statusFilter === 'all'}
              onPress={() => selectStatusFilter('all')}
            />
            {statusCounts.in_process > 0 ? (
              <FilterPill
                label={`In process (${statusCounts.in_process})`}
                selected={statusFilter === 'in_process'}
                onPress={() => selectStatusFilter('in_process')}
              />
            ) : null}
            {statusCounts.processed > 0 ? (
              <FilterPill
                label={`Processed (${statusCounts.processed})`}
                selected={statusFilter === 'processed'}
                onPress={() => selectStatusFilter('processed')}
              />
            ) : null}
            {statusCounts.open > 0 ? (
              <FilterPill
                label={`Open (${statusCounts.open})`}
                selected={statusFilter === 'open'}
                onPress={() => selectStatusFilter('open')}
              />
            ) : null}
          </FilterPillRow>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : (
        <SectionList
          ref={listRef}
          sections={[{ key: 'orders', title: '', data: filteredOrders }]}
          style={styles.list}
          keyExtractor={(o) => o.order_id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.listContent,
            filteredOrders.length === 0 && styles.listEmpty,
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
              {searchLower || statusFilter !== 'all'
                ? 'No orders match your filters'
                : 'No orders yet — Zomato sync imports appear here'}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedId(item.order_id)}
              style={({ pressed }) => [styles.orderCard, pressed && styles.orderCardPressed]}
            >
              <View style={styles.orderCardTop}>
                <View style={styles.orderIdBlock}>
                  <Text style={styles.orderIdLabel}>Order</Text>
                  <Text style={styles.orderIdValue}>#{orderDisplayId(item)}</Text>
                </View>
                <Chip compact style={[orderChipBase, statusChipStyle(item.status), styles.chip]}>
                  {statusLabel(item.status)}
                </Chip>
              </View>
              <Text style={styles.itemsPreview} numberOfLines={2}>
                {itemsSummary(item)}
              </Text>
              <Text style={styles.orderMeta}>
                {sourceLabel(item.source)} · {formatWhen(item.created_at)}
              </Text>
            </Pressable>
          )}
        />
      )}

      <OrderDetailSheet
        visible={selectedId != null}
        orderId={selectedId}
        kitchenId={kitchenId}
        onClose={() => setSelectedId(null)}
        onOrderUpdated={handleOrderUpdated}
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
  processAllBtn: { borderRadius: 10, marginVertical: 0 },
  loader: { marginTop: 48 },
  list: { flex: 1 },
  footerLoader: { marginVertical: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: palette.textMuted, textAlign: 'center', padding: 32 },
  error: { color: palette.error, paddingHorizontal: 16, marginBottom: 8 },
  orderCard: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  orderCardPressed: { opacity: 0.85 },
  orderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderIdBlock: { flex: 1, paddingRight: 8 },
  orderIdLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderIdValue: { color: palette.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  itemsPreview: { color: palette.text, fontSize: 14, lineHeight: 20 },
  orderMeta: { color: palette.textMuted, fontSize: 12, marginTop: 6 },
  chip: {},
});
