import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { ActivityIndicator, IconButton, Searchbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterPill, FilterPillRow } from '../components/FilterPill';
import { AddShoppingSheet } from '../components/shopping/AddShoppingSheet';
import { ShoppingListItem } from '../components/shopping/ShoppingListItem';
import { ScreenHeader } from '../components/ScreenHeader';
import { useIngredientCatalog } from '../hooks/useIngredientCatalog';
import { useSectionListFilterScroll } from '../hooks/useSectionListFilterScroll';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { ShoppingRow } from '../types';
import { formatFoodGroupLabel, normalizeFoodGroup, STATIC_FOOD_GROUPS } from '../utils/foodGroup';
import { showAppError } from '../utils/alertMessage';
import { palette } from '../theme';

type BuyFilter = 'all' | string;

type BuySection = {
  key: string;
  title: string;
  data: ShoppingRow[];
};

async function confirmRemove(name: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return window.confirm(`Remove "${name}" from the buy list?`);
  }
  return new Promise((resolve) => {
    Alert.alert('Remove item', `Remove "${name}" from the buy list?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { kitchen } = useRestaurant();
  const kitchenId = kitchen?.kitchen_id ?? '';
  const [items, setItems] = useState<ShoppingRow[]>([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<BuyFilter>('all');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { catalog } = useIngredientCatalog();
  const loadGenRef = useRef(0);
  const listMountKey = `buy-${groupFilter}-${loading ? 'loading' : 'ready'}`;
  const {
    listRef,
    handleListScroll,
    handleContentSizeChange,
    resetForFilterChange,
  } = useSectionListFilterScroll<ShoppingRow>(groupFilter, loading);

  const selectGroupFilter = useCallback(
    (filter: BuyFilter) => {
      if (filter === groupFilter) return;
      resetForFilterChange();
      setGroupFilter(filter);
    },
    [groupFilter, resetForFilterChange],
  );

  const load = useCallback(
    async (gen?: number) => {
      if (!kitchenId) return;
      const data = await restaurantFetch<{ items: ShoppingRow[] }>(`/restaurant/${kitchenId}/shopping`);
      if (gen != null && gen !== loadGenRef.current) return;
      setItems(data?.items ?? []);
    },
    [kitchenId],
  );

  useEffect(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError('');
    load(gen)
      .catch((e) => {
        if (gen !== loadGenRef.current) return;
        setItems([]);
        setError(e instanceof Error ? e.message : 'Failed to load buy list');
      })
      .finally(() => {
        if (gen !== loadGenRef.current) return;
        setLoading(false);
        setHasLoadedOnce(true);
      });
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load buy list');
    } finally {
      setRefreshing(false);
    }
  };

  const searchLower = search.trim().toLowerCase();

  const foodGroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = normalizeFoodGroup(item.food_group);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

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
    if (groupFilter === 'all' || foodGroups.some((g) => g.key === groupFilter)) {
      return;
    }
    selectGroupFilter('all');
  }, [groupFilter, foodGroups, selectGroupFilter]);

  const filteredItems = useMemo(() => {
    const byGroup =
      groupFilter === 'all'
        ? items
        : items.filter((item) => normalizeFoodGroup(item.food_group) === groupFilter);
    const base = !searchLower
      ? byGroup
      : byGroup.filter((item) => {
          const name = item.name.toLowerCase();
          const group = formatFoodGroupLabel(item.food_group).toLowerCase();
          return name.includes(searchLower) || group.includes(searchLower);
        });
    return [...base].sort((a, b) => {
      const ga = normalizeFoodGroup(a.food_group);
      const gb = normalizeFoodGroup(b.food_group);
      const ai = STATIC_FOOD_GROUPS.indexOf(ga as (typeof STATIC_FOOD_GROUPS)[number]);
      const bi = STATIC_FOOD_GROUPS.indexOf(gb as (typeof STATIC_FOOD_GROUPS)[number]);
      const orderA = ai === -1 ? STATIC_FOOD_GROUPS.length : ai;
      const orderB = bi === -1 ? STATIC_FOOD_GROUPS.length : bi;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [items, searchLower, groupFilter]);

  const showGroupedSections = groupFilter === 'all';

  const listSections = useMemo((): BuySection[] => {
    if (!showGroupedSections) {
      return [{ key: String(groupFilter), title: '', data: filteredItems }];
    }
    const grouped = new Map<string, ShoppingRow[]>();
    for (const item of filteredItems) {
      const key = normalizeFoodGroup(item.food_group);
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }
    return STATIC_FOOD_GROUPS.filter((key) => (grouped.get(key)?.length ?? 0) > 0).map((key) => ({
      key,
      title: formatFoodGroupLabel(key),
      data: grouped.get(key) ?? [],
    }));
  }, [filteredItems, groupFilter, showGroupedSections]);

  const handleAdd = async (payload: { name: string; qty: number; unit: string }) => {
    if (!kitchenId) return;
    setSaving(true);
    try {
      const created = await restaurantFetch<ShoppingRow>(`/restaurant/${kitchenId}/shopping`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setItems((prev) => [created, ...prev]);
      setSheetOpen(false);
      setGroupFilter('all');
      resetForFilterChange();
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not add item');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (item: ShoppingRow) => {
    if (!kitchenId) return;
    const ok = await confirmRemove(item.name);
    if (!ok) return;
    try {
      await restaurantFetch(`/restaurant/${kitchenId}/shopping/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not remove item');
    }
  };

  const subtitle = loading
    ? 'Loading buy list…'
    : `${items.length} item${items.length === 1 ? '' : 's'} to procure`;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Buy" subtitle={subtitle} />

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
          size={22}
          onPress={() => setSheetOpen(true)}
          style={styles.addBtn}
          accessibilityLabel="Add buy list item"
        />
      </View>

      {items.length > 0 ? (
        <View style={styles.filterRowWrap}>
          <FilterPillRow>
            <FilterPill
              label={`All (${items.length})`}
              selected={groupFilter === 'all'}
              onPress={() => selectGroupFilter('all')}
            />
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

      {loading && !hasLoadedOnce ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : (
        <SectionList
          key={listMountKey}
          ref={listRef}
          sections={listSections}
          style={styles.list}
          scrollEnabled={!loading}
          keyExtractor={(item) => item.id}
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
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={palette.primary} style={styles.footerLoader} />
            ) : (
              <Text style={styles.empty}>
                {searchLower || groupFilter !== 'all'
                  ? 'No items match your filters'
                  : 'Nothing to buy — tap + to add ingredients'}
              </Text>
            )
          }
          renderSectionHeader={({ section }) =>
            section.title ? (
              <Text variant="titleSmall" style={styles.sectionHeader}>
                {section.title}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ShoppingListItem
              item={item}
              menuActions={[
                {
                  key: 'remove',
                  label: 'Remove from list',
                  icon: 'delete-outline',
                  destructive: true,
                  onPress: () => handleRemove(item),
                },
              ]}
            />
          )}
        />
      )}

      <AddShoppingSheet
        visible={sheetOpen}
        saving={saving}
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
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
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
  filterRowWrap: { backgroundColor: palette.background },
  loader: { marginTop: 48 },
  list: { flex: 1 },
  footerLoader: { marginVertical: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
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
