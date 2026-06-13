import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import {
  Text,
  IconButton,
  Surface,
  Button,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as api from '../services/api';
import { CommercePartner, OrderSuggestItem, OrderSuggestResponse, UserShoppingItem } from '../types';
import { OrderOnlineSheet } from '../components/OrderOnlineSheet';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { TabScreenHeader } from '../components/TabScreenHeader';
import { showAppError, showAppSuccess } from '../utils/alertMessage';
import { formatShoppingQty } from '../utils/shoppingFormat';
import { AddShoppingModal } from '../components/modals/AddShoppingModal';
import { EditShoppingItemSheet } from '../components/shopping/EditShoppingItemSheet';
import { ShoppingListItem } from '../components/shopping/ShoppingListItem';
import type { InventoryMenuAction } from '../components/inventory/InventoryItemActionsSheet';
import { DEFAULT_UNIT } from '../components/UnitPillSelector';
import { useAppRefresh, refreshAppliesTo } from '../context/AppRefreshContext';
import { useIngredientCatalog } from '../hooks/useIngredientCatalog';
import { normalizeSuggestedShoppingLine, sameIngredient } from '../utils/ingredientUnits';
import { useUndoSnackbar } from '../hooks/useUndoSnackbar';
import { restoreListEntries } from '../utils/restoreListEntries';
import { writeOrderSuggestionsCache } from '../utils/orderSuggestionsCache';

/** Server-side suggestion pool size (matches backend OrderSuggestCacheSize). */
const SUGGEST_CACHE_SIZE = 12;
/** How many suggestions to show at once in the UI. */
const SUGGEST_DISPLAY_LIMIT = 5;

type ShoppingListEntry = { item: UserShoppingItem; index: number };

type PendingShoppingBatch = {
  entries: ShoppingListEntry[];
  ids: string[];
};

export function ShoppingScreen() {
  const { contentPaddingBottom } = useTabBarLayout();
  const [items, setItems] = useState<UserShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<UserShoppingItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const { showUndo, cancelCommit, undoSnackbar } = useUndoSnackbar({
    undoFailedMessage: 'Could not undo.',
  });
  const pendingShoppingDeletesRef = useRef<Map<string, PendingShoppingBatch>>(new Map());
  const pendingShoppingPurchasesRef = useRef<Map<string, PendingShoppingBatch>>(new Map());

  const [orderSuggestions, setOrderSuggestions] = useState<OrderSuggestItem[]>([]);
  const [orderSummary, setOrderSummary] = useState('');
  const [orderSuggestFailed, setOrderSuggestFailed] = useState(false);
  const [orderLoading, setOrderLoading] = useState(true);
  const [addingSuggest, setAddingSuggest] = useState<string | null>(null);
  const [orderPartners, setOrderPartners] = useState<CommercePartner[]>([]);
  const [commerceEnabled, setCommerceEnabled] = useState(false);
  const [orderSheetVisible, setOrderSheetVisible] = useState(false);
  const lastSuggestNamesRef = useRef<string[]>([]);
  const skipMountLoadSuggestions = useRef(true);
  const [suggestExpanded, setSuggestExpanded] = useState(false);
  const skipMountLoadItems = useRef(true);
  const isFocused = useIsFocused();
  const { version: refreshVersion, scope: refreshScope, bump } = useAppRefresh();
  const { catalog } = useIngredientCatalog();

  const selectedList = useMemo(
    () => items.filter((i) => selectedIds[i.id]),
    [items, selectedIds],
  );

  const loadItems = useCallback(async () => {
    try {
      const all = await api.getShoppingItems();
      setItems(Array.isArray(all) ? all : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyOrderSuggestResponse = useCallback((data: OrderSuggestResponse) => {
    if (data.source === 'error') {
      setOrderSuggestions([]);
      setOrderSummary(data.summary || 'Nothing to suggest right now.');
      setOrderSuggestFailed(true);
      lastSuggestNamesRef.current = [];
      return;
    }
    const pool = (Array.isArray(data.items) ? data.items : []).slice(0, SUGGEST_CACHE_SIZE);
    setOrderSuggestions(pool);
    setOrderSummary(data.summary ?? '');
    setOrderSuggestFailed(false);
    lastSuggestNamesRef.current = pool.map((s) => s.name.trim()).filter(Boolean);
    void writeOrderSuggestionsCache({ ...data, items: pool }, lastSuggestNamesRef.current);
  }, []);

  const refillSuggestionPool = useCallback(async () => {
    setOrderLoading(true);
    try {
      const data = await api.getOrderSuggestions();
      applyOrderSuggestResponse(data);
    } catch {
      setOrderSuggestions([]);
      setOrderSummary('Nothing to suggest right now.');
      setOrderSuggestFailed(true);
      lastSuggestNamesRef.current = [];
    } finally {
      setOrderLoading(false);
    }
  }, [applyOrderSuggestResponse]);

  const loadOrderSuggestions = refillSuggestionPool;

  useFocusEffect(
    useCallback(() => {
      void loadItems();
      void loadOrderSuggestions();
    }, [loadItems, loadOrderSuggestions]),
  );

  // Commerce surface is server-controlled (COMMERCE_ENABLED + partner list). Client has no store URLs.
  useEffect(() => {
    let active = true;
    void api.getCommercePartners().then((res) => {
      if (!active) return;
      const on = Boolean(res.enabled) && Array.isArray(res.partners) && res.partners.length > 0;
      setCommerceEnabled(on);
      setOrderPartners(on ? res.partners : []);
    });
    return () => {
      active = false;
    };
  }, []);

  // Shopping list changed elsewhere while this tab is focused.
  useEffect(() => {
    if (!isFocused) return;
    if (skipMountLoadItems.current) {
      skipMountLoadItems.current = false;
      return;
    }
    if (!refreshAppliesTo(refreshScope, 'shopping')) return;
    void loadItems();
  }, [isFocused, loadItems, refreshVersion, refreshScope]);

  // Inventory or shopping list changed elsewhere while this tab is focused.
  useEffect(() => {
    if (!isFocused) return;
    if (skipMountLoadSuggestions.current) {
      skipMountLoadSuggestions.current = false;
      return;
    }
    if (!refreshAppliesTo(refreshScope, ['shopping', 'inventory'])) return;
    void loadOrderSuggestions();
  }, [isFocused, loadOrderSuggestions, refreshVersion, refreshScope]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    await loadOrderSuggestions();
    setRefreshing(false);
  }, [loadItems, loadOrderSuggestions]);

  const visibleSuggestions = useMemo(() => {
    const listNames = items.map((i) => i.name.trim()).filter(Boolean);
    return orderSuggestions.filter((s) => {
      const key = s.name.trim();
      if (!key) return false;
      return !listNames.some((name) => sameIngredient(catalog, s.name, name));
    });
  }, [orderSuggestions, items, catalog]);

  const displaySuggestions = useMemo(
    () => visibleSuggestions.slice(0, SUGGEST_DISPLAY_LIMIT),
    [visibleSuggestions],
  );

  const addSuggestionToList = async (suggestion: OrderSuggestItem) => {
    const key = suggestion.name.trim().toLowerCase();
    setAddingSuggest(key);
    try {
      const line = normalizeSuggestedShoppingLine(catalog, suggestion);
      await api.addShoppingItem(line.name, line.qty, line.unit);
      await loadItems();
      await refillSuggestionPool();
      showAppSuccess(`"${suggestion.name}" added to your list`);
    } catch {
      showAppError('Could not add item to list.');
    } finally {
      setAddingSuggest(null);
    }
  };

  const addAllSuggestions = async () => {
    if (displaySuggestions.length === 0) return;
    setAddingSuggest('__all__');
    try {
      await api.addBulkShoppingItems(
        displaySuggestions.map((s) => normalizeSuggestedShoppingLine(catalog, s)),
      );
      await loadItems();
      await refillSuggestionPool();
      showAppSuccess(`Added ${displaySuggestions.length} item${displaySuggestions.length !== 1 ? 's' : ''} to your list`);
    } catch {
      showAppError('Could not add suggestions.');
    } finally {
      setAddingSuggest(null);
    }
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds({});
  };

  const restoreShoppingEntries = useCallback((entries: ShoppingListEntry[]) => {
    setItems((prev) => restoreListEntries(prev, entries, (i) => i.id));
  }, []);

  const captureShoppingEntries = useCallback((ids: string[]) => {
    let entries: ShoppingListEntry[] = [];
    setItems((prev) => {
      entries = ids
        .map((id) => {
          const index = prev.findIndex((i) => i.id === id);
          const item = prev[index];
          return index >= 0 && item ? { item, index } : null;
        })
        .filter((x): x is ShoppingListEntry => x != null);
      if (entries.length === 0) return prev;
      const idSet = new Set(ids);
      return prev.filter((i) => !idSet.has(i.id));
    });
    return entries;
  }, []);

  const commitShoppingDelete = useCallback((batchId: string) => {
    const pending = pendingShoppingDeletesRef.current.get(batchId);
    if (!pending) return;
    pendingShoppingDeletesRef.current.delete(batchId);
    void api.bulkDeleteShoppingItems(pending.ids).then(() => {
      bump('shopping');
    }).catch(() => {
      restoreShoppingEntries(pending.entries);
      showAppError('Could not remove items.');
    });
  }, [restoreShoppingEntries, bump]);

  const commitShoppingPurchase = useCallback(
    (batchId: string) => {
      const pending = pendingShoppingPurchasesRef.current.get(batchId);
      if (!pending) return;
      pendingShoppingPurchasesRef.current.delete(batchId);
      void api.purchaseShoppingItems(pending.ids).then(() => {
        bump('shopping');
      }).catch(() => {
        restoreShoppingEntries(pending.entries);
        showAppError('Could not add to inventory.');
      });
    },
    [restoreShoppingEntries, bump],
  );

  const flushPendingShoppingDeletes = useCallback(() => {
    const batchIds = [...pendingShoppingDeletesRef.current.keys()];
    if (batchIds.length === 0) return;
    batchIds.forEach((batchId) => commitShoppingDelete(batchId));
    cancelCommit();
  }, [commitShoppingDelete, cancelCommit]);

  const flushPendingShoppingPurchases = useCallback(() => {
    const batchIds = [...pendingShoppingPurchasesRef.current.keys()];
    if (batchIds.length === 0) return;
    batchIds.forEach((batchId) => commitShoppingPurchase(batchId));
    cancelCommit();
  }, [commitShoppingPurchase, cancelCommit]);

  const flushPendingShoppingActions = useCallback(() => {
    flushPendingShoppingDeletes();
    flushPendingShoppingPurchases();
  }, [flushPendingShoppingDeletes, flushPendingShoppingPurchases]);

  const scheduleRemoveFromList = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;

      flushPendingShoppingActions();

      const batchId = `${Date.now()}-del-${ids.join(',')}`;
      const entries = captureShoppingEntries(ids);

      if (entries.length === 0) return;

      exitSelection();

      const idsToDelete = entries.map((e) => e.item.id);
      pendingShoppingDeletesRef.current.set(batchId, {
        entries,
        ids: idsToDelete,
      });

      const msg =
        entries.length === 1
          ? `"${entries[0].item.name}" removed.`
          : `${entries.length} items removed.`;

      showUndo(
        msg,
        async () => {
          const pending = pendingShoppingDeletesRef.current.get(batchId);
          if (!pending) return;
          pendingShoppingDeletesRef.current.delete(batchId);
          restoreShoppingEntries(pending.entries);
        },
        () => commitShoppingDelete(batchId),
      );
    },
    [
      flushPendingShoppingActions,
      captureShoppingEntries,
      commitShoppingDelete,
      showUndo,
      restoreShoppingEntries,
    ],
  );

  const scheduleAddToInventory = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;

      flushPendingShoppingActions();

      const batchId = `${Date.now()}-buy-${ids.join(',')}`;
      const entries = captureShoppingEntries(ids);

      if (entries.length === 0) return;

      exitSelection();

      const idsToPurchase = entries.map((e) => e.item.id);
      pendingShoppingPurchasesRef.current.set(batchId, {
        entries,
        ids: idsToPurchase,
      });

      const msg =
        entries.length === 1
          ? `"${entries[0].item.name}" added to inventory`
          : `${entries.length} items added to inventory`;

      showUndo(
        msg,
        async () => {
          const pending = pendingShoppingPurchasesRef.current.get(batchId);
          if (!pending) return;
          pendingShoppingPurchasesRef.current.delete(batchId);
          restoreShoppingEntries(pending.entries);
        },
        () => commitShoppingPurchase(batchId),
      );
    },
    [
      flushPendingShoppingActions,
      captureShoppingEntries,
      commitShoppingPurchase,
      showUndo,
      restoreShoppingEntries,
    ],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    items.forEach((i) => {
      next[i.id] = true;
    });
    setSelectedIds(next);
  };

  const openAddModal = () => {
    setAddModalVisible(true);
  };

  const openEditItem = useCallback((item: UserShoppingItem) => {
    setEditItem(item);
  }, []);

  const buildShoppingMenu = useCallback(
    (item: UserShoppingItem): InventoryMenuAction[] => [
      {
        key: 'edit',
        label: 'Edit',
        icon: 'pencil-outline',
        onPress: () => openEditItem(item),
      },
      {
        key: 'inventory',
        label: 'Add to inventory',
        icon: 'fridge-outline',
        onPress: () => scheduleAddToInventory([item.id]),
      },
      {
        key: 'remove',
        label: 'Remove from list',
        icon: 'delete-outline',
        destructive: true,
        onPress: () => scheduleRemoveFromList([item.id]),
      },
    ],
    [openEditItem, scheduleAddToInventory, scheduleRemoveFromList],
  );

  const handleSaveEdit = async (patch: { name: string; qty: number; unit: string }) => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      const updated = await api.updateShoppingItem(editItem.id, patch);
      setItems((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      setEditItem(null);
      showAppSuccess('Shopping list updated');
      bump('shopping');
    } catch {
      showAppError('Could not update item.');
    } finally {
      setEditSaving(false);
    }
  };

  const renderItem = (item: UserShoppingItem, idx: number) => {
    const selected = Boolean(selectedIds[item.id]);

    return (
      <ShoppingListItem
        key={item.id}
        item={item}
        index={idx}
        selectionMode={selectionMode}
        selected={selected}
        menuActions={buildShoppingMenu(item)}
        onToggleSelect={() => toggleSelect(item.id)}
        onEnterSelection={() => {
          setSelectionMode(true);
          setSelectedIds({ [item.id]: true });
        }}
      />
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: contentPaddingBottom(selectionMode ? 88 : 24) },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TabScreenHeader
          title="Shopping List"
          subtitle={
            items.length > 0
              ? `${items.length} item${items.length !== 1 ? 's' : ''} to buy`
              : 'Nothing to buy yet'
          }
        />

        <Surface style={styles.suggestCard} elevation={1}>
          <View style={styles.suggestHeader}>
            <Pressable
              style={styles.suggestHeaderPressable}
              onPress={() => setSuggestExpanded((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: suggestExpanded }}
              accessibilityLabel="Suggested to order, tap to expand or collapse"
            >
              <View style={styles.suggestTitleRow}>
                <View style={styles.suggestIconWrap}>
                  <Icon source="lightbulb-on-outline" size={22} color="#2E7D32" />
                </View>
                <View style={styles.suggestTitleText}>
                  <Text variant="titleSmall" style={styles.suggestTitle}>
                    Suggested to order
                    {displaySuggestions.length > 0 ? ` (${displaySuggestions.length})` : ''}
                  </Text>
                  <Text variant="labelSmall" style={styles.suggestBadge}>
                    {orderSuggestFailed ? 'Unavailable' : 'From meal plan · tap to expand'}
                  </Text>
                </View>
                <Icon
                  source={suggestExpanded ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color="#888888"
                />
              </View>
            </Pressable>
            <IconButton
              icon="refresh"
              size={20}
              onPress={() => void loadOrderSuggestions()}
              disabled={orderLoading}
              accessibilityLabel="Refresh suggestions"
            />
          </View>

          {!suggestExpanded ? (
            orderLoading ? (
              <ActivityIndicator style={styles.suggestLoaderCollapsed} size="small" color="#2E7D32" />
            ) : (
              <Text variant="bodySmall" style={styles.suggestCollapsedHint} numberOfLines={2}>
                {displaySuggestions.length > 0
                  ? displaySuggestions.map((s) => s.name).join(', ')
                  : orderSummary || 'Nothing to suggest right now.'}
              </Text>
            )
          ) : orderLoading ? (
            <ActivityIndicator style={styles.suggestLoader} size="small" color="#2E7D32" />
          ) : (
            <>
              {orderSummary && displaySuggestions.length > 0 ? (
                <Text variant="bodySmall" style={styles.suggestSummary}>{orderSummary}</Text>
              ) : null}

              {displaySuggestions.length > 0 ? (
                <>
                  {displaySuggestions.length > 1 ? (
                    <Button
                      mode="contained-tonal"
                      icon="cart-plus"
                      compact
                      onPress={() => void addAllSuggestions()}
                      loading={addingSuggest === '__all__'}
                      disabled={addingSuggest != null}
                      style={styles.suggestAddAll}
                      buttonColor="#E8F5E9"
                      textColor="#2E7D32"
                    >
                      Add all {displaySuggestions.length}
                    </Button>
                  ) : null}
                  <View style={styles.suggestList}>
                    {displaySuggestions.map((s) => {
                      const key = s.name.trim().toLowerCase();
                      const qtyLabel =
                        s.qty > 0 ? `${s.qty} ${s.unit || DEFAULT_UNIT}` : s.unit || DEFAULT_UNIT;
                      return (
                        <View key={key} style={styles.suggestRow}>
                          <View style={styles.suggestRowInfo}>
                            <View style={styles.itemTitleRow}>
                              <View style={styles.itemNameWrap}>
                                <Text
                                  variant="bodyMedium"
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                  style={styles.suggestName}
                                >
                                  {s.name}
                                </Text>
                              </View>
                              <Text variant="bodyMedium" style={styles.itemQtySuffix}>
                                <Text style={styles.itemSep}> · </Text>
                                <Text style={styles.itemQty}>{qtyLabel}</Text>
                              </Text>
                            </View>
                            {s.reason ? (
                              <Text variant="bodySmall" style={styles.suggestReason} numberOfLines={2}>
                                {s.reason}
                              </Text>
                            ) : null}
                          </View>
                          <IconButton
                            icon="plus-circle-outline"
                            iconColor="#2E7D32"
                            size={26}
                            onPress={() => void addSuggestionToList(s)}
                            disabled={addingSuggest != null}
                            loading={addingSuggest === key}
                            accessibilityLabel={`Add ${s.name}`}
                          />
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : (
                <Text variant="bodySmall" style={styles.suggestEmpty}>
                  {orderSuggestFailed
                    ? (orderSummary || 'Nothing to suggest right now.')
                    : orderSummary
                      || (orderSuggestions.length > 0
                        ? 'All suggested items are already on your list or in your pantry.'
                        : 'Nothing to suggest right now.')}
                </Text>
              )}
            </>
          )}
        </Surface>

        <Text variant="labelLarge" style={styles.listSectionTitle}>Your list</Text>

        {!loading ? (
          <View style={styles.listToolbar}>
            <View style={styles.listToolbarLeft}>
              {items.length > 0 ? (
                selectionMode ? (
                  <>
                    <Button mode="text" compact onPress={exitSelection}>
                      Cancel
                    </Button>
                    <Button mode="text" compact onPress={selectAll}>
                      All
                    </Button>
                  </>
                ) : (
                  <Button
                    mode="text"
                    compact
                    icon="checkbox-multiple-marked"
                    onPress={() => setSelectionMode(true)}
                  >
                    Select
                  </Button>
                )
              ) : null}
            </View>
            {!selectionMode ? (
              <Button
                mode="contained"
                onPress={openAddModal}
                buttonColor="#2E7D32"
                style={styles.listAddBtn}
                contentStyle={styles.listAddBtnContent}
                labelStyle={styles.listAddBtnLabel}
              >
                Add
              </Button>
            ) : null}
          </View>
        ) : null}

        {!loading && items.length > 0 && !selectionMode && commerceEnabled ? (
          <Button
            mode="contained-tonal"
            icon="cart-arrow-right"
            onPress={() => setOrderSheetVisible(true)}
            style={styles.orderOnlineBtn}
            textColor="#1B5E20"
          >
            Order this list online
          </Button>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" />
        ) : items.length > 0 ? (
          <View style={styles.listWrap}>
            {items.map(renderItem)}
          </View>
        ) : (
          <Surface style={styles.emptyCard} elevation={1}>
            <IconButton icon="cart-outline" iconColor="#2E7D32" size={44} style={{ margin: 0 }} />
            <Text variant="titleMedium" style={styles.emptyTitle}>Your list is empty</Text>
            <Text variant="bodyMedium" style={styles.emptySub}>
              Tap <Text style={styles.emptyAddHint}>Add</Text> on the right to build your list. When you buy
              something, move it to inventory — we&apos;ll estimate expiry for you.
            </Text>
          </Surface>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {selectionMode && selectedList.length > 0 ? (
        <Surface
          style={[styles.selectionBar, { paddingBottom: contentPaddingBottom(8) }]}
          elevation={4}
        >
          <Text variant="labelLarge" style={styles.selectionCount}>
            {selectedList.length} selected
          </Text>
          <View style={styles.selectionActions}>
            <Button
              mode="contained"
              icon="fridge-outline"
              onPress={() => scheduleAddToInventory(selectedList.map((i) => i.id))}
              buttonColor="#2E7D32"
              compact
            >
              To inventory
            </Button>
            <Button
              mode="outlined"
              icon="delete-outline"
              textColor="#F44336"
              onPress={() => scheduleRemoveFromList(selectedList.map((i) => i.id))}
              compact
            >
              Remove
            </Button>
          </View>
        </Surface>
      ) : null}

      <AddShoppingModal
        visible={addModalVisible}
        onDismiss={() => setAddModalVisible(false)}
      />

      <EditShoppingItemSheet
        visible={editItem !== null}
        item={editItem}
        onDismiss={() => !editSaving && setEditItem(null)}
        onSave={handleSaveEdit}
        saving={editSaving}
      />

      <OrderOnlineSheet
        visible={orderSheetVisible}
        onClose={() => setOrderSheetVisible(false)}
        items={items}
        partners={orderPartners}
        source="shopping_list"
      />

      {undoSnackbar}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  suggestCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  suggestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestHeaderPressable: { flex: 1, marginRight: 4 },
  suggestTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  suggestCollapsedHint: {
    color: '#777',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  suggestLoaderCollapsed: { marginTop: 8, marginBottom: 4 },
  suggestIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestTitleText: { flex: 1 },
  suggestTitle: { fontWeight: '800', color: '#1A1A1A' },
  suggestBadge: { color: '#888888', marginTop: 2 },
  suggestLoader: { marginVertical: 16 },
  suggestSummary: { color: '#666', marginTop: 10, lineHeight: 18 },
  suggestAddAll: { alignSelf: 'flex-start', marginTop: 12, borderRadius: 10 },
  suggestList: { marginTop: 10, gap: 8 },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingLeft: 12,
    paddingVertical: 4,
  },
  suggestRowInfo: { flex: 1, paddingVertical: 6, minWidth: 0 },
  suggestName: { fontWeight: '700', color: '#333', lineHeight: 20 },
  suggestReason: { color: '#888', marginTop: 2, lineHeight: 16 },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  itemNameWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  itemQtySuffix: { flexShrink: 0, lineHeight: 20 },
  itemSep: { fontWeight: '400', color: '#888888' },
  itemQty: { fontWeight: '500', color: '#888888' },
  suggestEmpty: { color: '#999', marginTop: 12, lineHeight: 18 },
  listSectionTitle: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 0,
    color: '#1A1A1A',
    fontWeight: '700',
  },
  listToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 44,
  },
  listToolbarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listAddBtn: {
    borderRadius: 10,
    minWidth: 96,
    alignSelf: 'center',
  },
  listAddBtnContent: {
    height: 40,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAddBtnLabel: {
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0,
    marginVertical: 0,
    marginHorizontal: 0,
    textAlign: 'center',
    includeFontPadding: false,
  },

  listWrap: { paddingHorizontal: 20, marginTop: 8, gap: 8 },
  orderOnlineBtn: { marginTop: 4, marginBottom: 8, marginHorizontal: 20, borderRadius: 12 },

  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  selectionCount: { color: '#333', marginBottom: 8 },
  selectionActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  emptyCard: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: { fontWeight: '700', color: '#555', marginTop: 12 },
  emptySub: { color: '#999', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  emptyAddHint: { fontWeight: '700', color: '#2E7D32' },
});
