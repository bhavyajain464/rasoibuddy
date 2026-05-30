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
  Portal,
  Dialog,
  Button,
  ActivityIndicator,
  Checkbox,
  Icon,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '../services/api';
import { OrderSuggestItem, UserShoppingItem } from '../types';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { ProfileHeaderButton } from '../components/ProfileHeaderButton';
import { showAppError, showAppSuccess } from '../utils/alertMessage';
import { formatShoppingQty } from '../utils/shoppingFormat';
import { AddShoppingModal } from '../components/modals/AddShoppingModal';
import { DEFAULT_UNIT } from '../components/UnitPillSelector';
import { useAppRefresh } from '../context/AppRefreshContext';

export function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { contentPaddingBottom } = useTabBarLayout();
  const [items, setItems] = useState<UserShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [orderSuggestions, setOrderSuggestions] = useState<OrderSuggestItem[]>([]);
  const [orderSummary, setOrderSummary] = useState('');
  const [orderSuggestFailed, setOrderSuggestFailed] = useState(false);
  const [orderLoading, setOrderLoading] = useState(true);
  const [addingSuggest, setAddingSuggest] = useState<string | null>(null);
  const [hiddenSuggest, setHiddenSuggest] = useState<Record<string, boolean>>({});
  const lastSuggestNamesRef = useRef<string[]>([]);
  const [suggestExpanded, setSuggestExpanded] = useState(false);
  const { version: refreshVersion } = useAppRefresh();

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

  const loadOrderSuggestions = useCallback(async (opts?: { refresh?: boolean }) => {
    setOrderLoading(true);
    const exclude = opts?.refresh ? lastSuggestNamesRef.current : [];
    try {
      const data = await api.getOrderSuggestions(exclude);
      if (data.source === 'error') {
        setOrderSuggestions([]);
        setOrderSummary(data.summary || 'Nothing to suggest right now.');
        setOrderSuggestFailed(true);
        lastSuggestNamesRef.current = [];
      } else {
        const next = Array.isArray(data.items) ? data.items : [];
        setOrderSuggestions(next);
        setOrderSummary(data.summary ?? '');
        setOrderSuggestFailed(false);
        lastSuggestNamesRef.current = next.map((s) => s.name.trim()).filter(Boolean);
      }
    } catch {
      setOrderSuggestions([]);
      setOrderSummary('Nothing to suggest right now.');
      setOrderSuggestFailed(true);
      lastSuggestNamesRef.current = [];
    } finally {
      setOrderLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
      void loadOrderSuggestions();
    }, [loadItems, loadOrderSuggestions]),
  );

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshVersion]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    await loadOrderSuggestions({ refresh: true });
    setRefreshing(false);
  }, [loadItems, loadOrderSuggestions]);

  const visibleSuggestions = useMemo(() => {
    const listNames = items.map((i) => i.name.trim().toLowerCase());
    return orderSuggestions.filter((s) => {
      const key = s.name.trim().toLowerCase();
      if (!key || hiddenSuggest[key]) return false;
      return !listNames.some((l) => l.includes(key) || key.includes(l));
    });
  }, [orderSuggestions, items, hiddenSuggest]);

  const displaySuggestions = useMemo(
    () => visibleSuggestions.slice(0, 4),
    [visibleSuggestions],
  );

  const addSuggestionToList = async (suggestion: OrderSuggestItem) => {
    const key = suggestion.name.trim().toLowerCase();
    setAddingSuggest(key);
    try {
      await api.addShoppingItem(suggestion.name.trim(), suggestion.qty || 0, suggestion.unit || DEFAULT_UNIT);
      setHiddenSuggest((prev) => ({ ...prev, [key]: true }));
      await loadItems();
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
        displaySuggestions.map((s) => ({
          name: s.name.trim(),
          qty: s.qty || 0,
          unit: s.unit || DEFAULT_UNIT,
        })),
      );
      const nextHidden = { ...hiddenSuggest };
      displaySuggestions.forEach((s) => {
        nextHidden[s.name.trim().toLowerCase()] = true;
      });
      setHiddenSuggest(nextHidden);
      await loadItems();
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
    setConfirmBulkDelete(false);
  };

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

  const removeFromList = async (ids: string[]) => {
    if (!ids.length) return;
    setActionLoading(true);
    try {
      await api.bulkDeleteShoppingItems(ids);
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      exitSelection();
    } catch {
      showAppError('Could not remove items.');
      await loadItems();
    } finally {
      setActionLoading(false);
      setConfirmBulkDelete(false);
    }
  };

  const addToInventory = async (ids: string[]) => {
    if (!ids.length) return;
    setActionLoading(true);
    try {
      const res = await api.purchaseShoppingItems(ids);
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      exitSelection();
      const n = res.purchased ?? ids.length;
      showAppSuccess(
        n === 1 ? 'Added to inventory' : `Added ${n} items to inventory`,
      );
    } catch {
      showAppError('Could not add to inventory.');
      await loadItems();
    } finally {
      setActionLoading(false);
    }
  };

  const renderItem = (item: UserShoppingItem, idx: number) => {
    const selected = Boolean(selectedIds[item.id]);

    return (
      <Pressable
        key={item.id}
        onPress={() => selectionMode && toggleSelect(item.id)}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds({ [item.id]: true });
          }
        }}
      >
        <Surface style={[styles.itemCard, selected && styles.itemCardSelected]} elevation={1}>
          <View style={styles.itemRow}>
            {selectionMode ? (
              <Checkbox
                status={selected ? 'checked' : 'unchecked'}
                onPress={() => toggleSelect(item.id)}
              />
            ) : (
              <View style={styles.itemNum}>
                <Text style={styles.itemNumText}>{idx + 1}</Text>
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text variant="bodyLarge" style={styles.itemName}>{item.name}</Text>
              <Text variant="bodySmall" style={styles.itemQty}>{formatShoppingQty(item)}</Text>
            </View>
            {!selectionMode ? (
              <View style={styles.itemActions}>
                <IconButton
                  icon="fridge-outline"
                  iconColor="#2E7D32"
                  size={22}
                  onPress={() => void addToInventory([item.id])}
                  disabled={actionLoading}
                  accessibilityLabel="Add to inventory"
                  style={{ margin: 0 }}
                />
                <IconButton
                  icon="delete-outline"
                  iconColor="#E57373"
                  size={22}
                  onPress={() => void removeFromList([item.id])}
                  disabled={actionLoading}
                  accessibilityLabel="Remove from list"
                  style={{ margin: 0 }}
                />
              </View>
            ) : null}
          </View>
        </Surface>
      </Pressable>
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
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerText}>
              <Text variant="headlineSmall" style={styles.headerTitle}>Shopping List</Text>
              <Text variant="bodyMedium" style={styles.headerSub}>
                {items.length > 0
                  ? `${items.length} item${items.length !== 1 ? 's' : ''} to buy`
                  : 'Nothing to buy yet'}
              </Text>
            </View>
            <ProfileHeaderButton />
          </View>
        </View>

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
                    {orderSuggestFailed ? 'Unavailable' : 'AI · tap to expand'}
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
              onPress={() => void loadOrderSuggestions({ refresh: true })}
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
                            <Text variant="bodyMedium" style={styles.suggestName}>{s.name}</Text>
                            {s.reason ? (
                              <Text variant="bodySmall" style={styles.suggestReason} numberOfLines={2}>
                                {s.reason}
                              </Text>
                            ) : null}
                            <Text variant="labelSmall" style={styles.suggestQty}>{qtyLabel}</Text>
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

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" />
        ) : items.length > 0 ? (
          <View style={styles.listWrap}>{items.map(renderItem)}</View>
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
              onPress={() => void addToInventory(selectedList.map((i) => i.id))}
              loading={actionLoading}
              buttonColor="#2E7D32"
              compact
            >
              To inventory
            </Button>
            <Button
              mode="outlined"
              icon="delete-outline"
              textColor="#F44336"
              onPress={() => setConfirmBulkDelete(true)}
              disabled={actionLoading}
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
        onAdded={() => void loadItems()}
      />

      <Portal>
        <Dialog visible={confirmBulkDelete} onDismiss={() => setConfirmBulkDelete(false)} style={styles.dialog}>
          <Dialog.Title>Remove {selectedList.length} item{selectedList.length !== 1 ? 's' : ''}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Remove from your shopping list only — not from inventory.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmBulkDelete(false)}>Cancel</Button>
            <Button
              textColor="#F44336"
              onPress={() => void removeFromList(selectedList.map((i) => i.id))}
              loading={actionLoading}
            >
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  header: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#fff', fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  suggestCard: {
    marginHorizontal: 20,
    marginTop: 16,
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
  suggestRowInfo: { flex: 1, paddingVertical: 6 },
  suggestName: { fontWeight: '700', color: '#333' },
  suggestReason: { color: '#888', marginTop: 2, lineHeight: 16 },
  suggestQty: { color: '#888888', marginTop: 4 },
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
  itemCard: {
    borderRadius: 14,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  itemCardSelected: {
    borderWidth: 1.5,
    borderColor: '#2E7D32',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingRight: 4,
  },
  itemActions: { flexDirection: 'row', alignItems: 'center' },
  itemNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemNumText: { color: '#666666', fontWeight: '700', fontSize: 13 },
  itemInfo: { flex: 1 },
  itemName: { fontWeight: '600', color: '#333' },
  itemQty: { color: '#888', marginTop: 2 },

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

  dialog: { borderRadius: 16 },
});
