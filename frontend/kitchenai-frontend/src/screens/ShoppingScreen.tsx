import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  IconButton,
  Surface,
  Portal,
  Dialog,
  Button,
  ActivityIndicator,
  Modal,
  Checkbox,
  Icon,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../services/api';
import { OrderSuggestItem, UserShoppingItem } from '../types';
import { layout } from '../theme';
import { showAppError, showAppSuccess } from '../utils/alertMessage';
import { DEFAULT_UNIT, UnitDropdown } from '../components/UnitDropdown';
import { formatShoppingQty, parseShoppingQtyInput } from '../utils/shoppingFormat';

type DraftRow = {
  key: string;
  name: string;
  qty: string;
  unit: string;
};

let draftRowCounter = 0;

function newDraftRow(unit = DEFAULT_UNIT): DraftRow {
  draftRowCounter += 1;
  return { key: `row-${draftRowCounter}`, name: '', qty: '', unit };
}

function initialDraftRows(count = 1): DraftRow[] {
  return Array.from({ length: count }, () => newDraftRow());
}

export function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<UserShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [draftRows, setDraftRows] = useState<DraftRow[]>(initialDraftRows);
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

  const selectedList = useMemo(
    () => items.filter((i) => selectedIds[i.id]),
    [items, selectedIds],
  );

  const filledRows = useMemo(
    () =>
      draftRows
        .map((row) => ({
          name: row.name.trim(),
          qty: parseShoppingQtyInput(row.qty),
          unit: row.unit || DEFAULT_UNIT,
        }))
        .filter((row) => row.name.length > 0),
    [draftRows],
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

  useEffect(() => {
    void loadItems();
    void loadOrderSuggestions();
  }, [loadItems, loadOrderSuggestions]);

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
    setDraftRows(initialDraftRows());
    setAddModalVisible(true);
  };

  const closeAddModal = () => {
    if (adding) return;
    setAddModalVisible(false);
    setDraftRows(initialDraftRows());
  };

  const updateDraftRow = (key: string, patch: Partial<Omit<DraftRow, 'key'>>) => {
    setDraftRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    setDraftRows((prev) => [...prev, newDraftRow(prev[prev.length - 1]?.unit ?? DEFAULT_UNIT)]);
  };

  const removeDraftRow = (key: string) => {
    setDraftRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)));
  };

  const submitDraftRows = async () => {
    if (!filledRows.length) return;
    setAdding(true);
    try {
      if (filledRows.length === 1) {
        const row = filledRows[0];
        const item = await api.addShoppingItem(row.name, row.qty, row.unit);
        setItems((prev) => [item, ...prev]);
      } else {
        const res = await api.addBulkShoppingItems(filledRows);
        const added: UserShoppingItem[] = Array.isArray(res?.items) ? res.items : [];
        if (added.length > 0) {
          setItems((prev) => [...added, ...prev]);
        } else {
          await loadItems();
        }
      }
      setAddModalVisible(false);
      setDraftRows(initialDraftRows());
    } catch {
      showAppError('Could not add items.');
    } finally {
      setAdding(false);
    }
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
          { paddingBottom: layout.tabBarHeight + insets.bottom + (selectionMode ? 88 : 24) },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text variant="headlineSmall" style={styles.headerTitle}>Shopping List</Text>
              <Text variant="bodyMedium" style={styles.headerSub}>
                {items.length > 0
                  ? `${items.length} item${items.length !== 1 ? 's' : ''} to buy`
                  : 'Nothing to buy yet'}
              </Text>
            </View>
            <Button
              mode="contained"
              icon="plus"
              onPress={openAddModal}
              style={styles.headerAddBtn}
              labelStyle={styles.headerAddLabel}
              buttonColor="#fff"
              textColor="#1976D2"
              compact
            >
              Add
            </Button>
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
                  <Icon source="lightbulb-on-outline" size={22} color="#6A1B9A" />
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
                  color="#6A1B9A"
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
              <ActivityIndicator style={styles.suggestLoaderCollapsed} size="small" color="#6A1B9A" />
            ) : (
              <Text variant="bodySmall" style={styles.suggestCollapsedHint} numberOfLines={2}>
                {displaySuggestions.length > 0
                  ? displaySuggestions.map((s) => s.name).join(', ')
                  : orderSummary || 'Nothing to suggest right now.'}
              </Text>
            )
          ) : orderLoading ? (
            <ActivityIndicator style={styles.suggestLoader} size="small" color="#6A1B9A" />
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
                      buttonColor="#F3E5F5"
                      textColor="#6A1B9A"
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
                            iconColor="#6A1B9A"
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

        {!loading && items.length > 0 ? (
          <View style={styles.listToolbar}>
            {selectionMode ? (
              <Button mode="text" compact onPress={exitSelection}>
                Cancel
              </Button>
            ) : (
              <Button mode="text" compact icon="checkbox-multiple-marked" onPress={() => setSelectionMode(true)}>
                Select
              </Button>
            )}
            {selectionMode ? (
              <Button mode="text" compact onPress={selectAll}>
                All
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
            <IconButton icon="cart-outline" iconColor="#2196F3" size={44} style={{ margin: 0 }} />
            <Text variant="titleMedium" style={styles.emptyTitle}>Your list is empty</Text>
            <Text variant="bodyMedium" style={styles.emptySub}>
              Add what you need. When you buy something, add it to inventory — we&apos;ll estimate expiry for you.
            </Text>
            <Button mode="contained" icon="plus" onPress={openAddModal} style={styles.emptyAddBtn} buttonColor="#2196F3">
              Add items
            </Button>
          </Surface>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {selectionMode && selectedList.length > 0 ? (
        <Surface
          style={[styles.selectionBar, { paddingBottom: insets.bottom + layout.tabBarHeight + 8 }]}
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

      <Portal>
        <Modal
          visible={addModalVisible}
          onDismiss={closeAddModal}
          contentContainerStyle={[styles.addModal, { marginTop: insets.top + 24 }]}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Text variant="titleLarge" style={styles.modalTitle}>Add items</Text>
            <Text variant="bodySmall" style={styles.modalSub}>
              Name required · quantity optional
            </Text>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {draftRows.map((row, index) => (
                <View key={row.key} style={styles.draftRow}>
                  <Text variant="labelSmall" style={styles.rowIndex}>{index + 1}</Text>
                  <TextInput
                    mode="outlined"
                    placeholder="Item name"
                    value={row.name}
                    onChangeText={(name) => updateDraftRow(row.key, { name })}
                    style={styles.nameInput}
                    dense
                    outlineColor="#E0E0E0"
                    activeOutlineColor="#2196F3"
                    outlineStyle={{ borderRadius: 10 }}
                  />
                  <TextInput
                    mode="outlined"
                    placeholder="Qty"
                    value={row.qty}
                    onChangeText={(qty) => updateDraftRow(row.key, { qty })}
                    keyboardType="decimal-pad"
                    style={styles.qtyInput}
                    dense
                    outlineColor="#E0E0E0"
                    activeOutlineColor="#2196F3"
                    outlineStyle={{ borderRadius: 10 }}
                  />
                  <UnitDropdown
                    value={row.unit}
                    onChange={(unit) => updateDraftRow(row.key, { unit })}
                    compact
                    style={styles.unitDropdown}
                  />
                  <IconButton
                    icon="close"
                    size={18}
                    iconColor="#999"
                    onPress={() => removeDraftRow(row.key)}
                    disabled={draftRows.length <= 1}
                    style={{ margin: 0 }}
                  />
                </View>
              ))}
            </ScrollView>

            <Button mode="text" icon="plus" onPress={addDraftRow} style={styles.addRowBtn}>
              Add another row
            </Button>

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={closeAddModal} disabled={adding} style={styles.modalBtn}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={submitDraftRows}
                loading={adding}
                disabled={!filledRows.length || adding}
                buttonColor="#2196F3"
                style={styles.modalBtn}
              >
                {filledRows.length > 1 ? `Add ${filledRows.length} items` : 'Add to list'}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>

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
  root: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  header: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  headerTitle: { color: '#fff', fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  headerAddBtn: { borderRadius: 20 },
  headerAddLabel: { fontWeight: '700', fontSize: 13 },

  suggestCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#EDE7F6',
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
    backgroundColor: '#F3E5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestTitleText: { flex: 1 },
  suggestTitle: { fontWeight: '800', color: '#4A148C' },
  suggestBadge: { color: '#9575CD', marginTop: 2 },
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
  suggestQty: { color: '#B39DDB', marginTop: 4 },
  suggestEmpty: { color: '#999', marginTop: 12, lineHeight: 18 },
  listSectionTitle: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
    color: '#555',
    fontWeight: '700',
  },

  listToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 14,
  },

  listWrap: { paddingHorizontal: 20, marginTop: 8, gap: 8 },
  itemCard: {
    borderRadius: 14,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  itemCardSelected: {
    borderWidth: 1.5,
    borderColor: '#2196F3',
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
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemNumText: { color: '#1976D2', fontWeight: '700', fontSize: 13 },
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
  emptyAddBtn: { marginTop: 20, borderRadius: 12 },

  addModal: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    maxHeight: '82%',
  },
  modalTitle: { fontWeight: '800', color: '#222' },
  modalSub: { color: '#888', marginTop: 4, marginBottom: 14 },
  modalScroll: { maxHeight: 340 },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  rowIndex: { width: 16, color: '#aaa', textAlign: 'center' },
  nameInput: { flex: 1, backgroundColor: '#fff', minWidth: 0 },
  qtyInput: { width: 52, backgroundColor: '#fff' },
  unitDropdown: { width: 72 },
  addRowBtn: { alignSelf: 'flex-start', marginTop: 4 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: { borderRadius: 10, minWidth: 108 },

  dialog: { borderRadius: 16 },
});
