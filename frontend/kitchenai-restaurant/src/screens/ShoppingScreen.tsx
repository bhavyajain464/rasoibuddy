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
import { AddShoppingSheet } from '../components/shopping/AddShoppingSheet';
import { ShoppingListItem } from '../components/shopping/ShoppingListItem';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSectionListFilterScroll } from '../hooks/useSectionListFilterScroll';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { ShoppingRow } from '../types';
import { showAppError } from '../utils/alertMessage';
import { palette } from '../theme';

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
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const autoSeedAttempted = useRef(false);
  const loadGenRef = useRef(0);
  const listMountKey = `buy-${loading ? 'loading' : 'ready'}`;
  const {
    listRef,
    handleListScroll,
    handleContentSizeChange,
  } = useSectionListFilterScroll<ShoppingRow>('buy', loading);

  const load = useCallback(
    async (gen?: number) => {
      if (!kitchenId) return;
      const data = await restaurantFetch<{ items: ShoppingRow[] }>(`/restaurant/${kitchenId}/shopping`);
      if (gen != null && gen !== loadGenRef.current) return;

      let list = data?.items ?? [];

      if (list.length === 0 && !autoSeedAttempted.current) {
        autoSeedAttempted.current = true;
        try {
          await restaurantFetch(`/restaurant/${kitchenId}/shopping/seed-samples`, {
            method: 'POST',
            body: '{}',
          });
          const seeded = await restaurantFetch<{ items: ShoppingRow[] }>(`/restaurant/${kitchenId}/shopping`);
          if (gen != null && gen !== loadGenRef.current) return;
          list = seeded?.items ?? [];
        } catch {
          // Keep empty if seed fails (e.g. offline).
        }
      }

      setItems(list);
    },
    [kitchenId],
  );

  const seedSamples = async () => {
    if (!kitchenId) return;
    setSeeding(true);
    try {
      await restaurantFetch(`/restaurant/${kitchenId}/shopping/seed-samples`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not load sample items');
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    autoSeedAttempted.current = false;
  }, [kitchenId]);

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

  const filteredItems = useMemo(() => {
    if (!searchLower) return items;
    return items.filter((item) => item.name.toLowerCase().includes(searchLower));
  }, [items, searchLower]);

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
          placeholder="Search buy list…"
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
              accessibilityLabel="Add buy list item"
            />
          }
          anchorPosition="bottom"
        >
          <Menu.Item
            leadingIcon="cart-plus"
            title="Add item"
            onPress={() => {
              setAddMenuOpen(false);
              setSheetOpen(true);
            }}
          />
          <Menu.Item
            leadingIcon="download"
            title="Load sample ingredients"
            onPress={() => {
              setAddMenuOpen(false);
              void seedSamples();
            }}
          />
        </Menu>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && !hasLoadedOnce ? (
        <ActivityIndicator color={palette.primary} style={styles.loader} />
      ) : (
        <SectionList
          key={listMountKey}
          ref={listRef}
          sections={[{ key: 'buy', title: '', data: filteredItems }]}
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
                {searchLower
                  ? 'No items match your search'
                  : 'Nothing to buy — tap + to add vendor items'}
              </Text>
            )
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
  loader: { marginTop: 48 },
  list: { flex: 1 },
  footerLoader: { marginVertical: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: palette.textMuted, textAlign: 'center', padding: 32 },
  error: { color: palette.error, paddingHorizontal: 16, marginBottom: 8 },
});
