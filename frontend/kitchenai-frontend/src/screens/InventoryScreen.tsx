import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import {
  Text,
  Searchbar,
  FAB,
  Portal,
  Modal,
  TextInput,
  Button,
  SegmentedButtons,
  Divider,
  Card,
  Surface,
  ActivityIndicator,
  IconButton,
  Checkbox,
  Snackbar,
  Menu,
  Icon,
} from 'react-native-paper';
import {
  useIsFocused,
  useRoute,
  useNavigation,
  useFocusEffect,
  RouteProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppConfirmDialog } from '../components/AppConfirmDialog';
import { BillCameraModal } from '../components/BillCameraModal';
import { InventoryItemCard } from '../components/InventoryItemCard';
import { AddInventoryModal } from '../components/modals/AddInventoryModal';
import {
  pickBillFileFromDevice,
  pickBillImageFromCameraWeb,
  type BillScanPick,
  isPdfBillPick,
} from '../utils/billImagePicker';
import * as api from '../services/api';
import { InventoryItem, ExpiringItem, ScanResult } from '../types';
import { colors } from '../theme';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { useEntitlements } from '../context/EntitlementsContext';
import { usePlanUpgrade } from '../hooks/usePlanUpgrade';
import { showUpgradeMessage } from '../utils/upgrade';
import { UpgradeRequiredError } from '../services/api';
import { showAppAlert } from '../utils/alertMessage';
import { BILL_SCAN_ALERT_MESSAGE, BILL_SCAN_ALERT_TITLE } from '../utils/billScanMessage';
import { showAppError, showAppInfo, showAppSuccess } from '../utils/alertMessage';
import { ProfileHeaderButton } from '../components/ProfileHeaderButton';
import { useAppRefresh } from '../context/AppRefreshContext';
import type { MainTabParamList } from '../navigation/types';

type TabValue = 'all' | 'expired';

export function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { totalHeight, contentPaddingBottom } = useTabBarLayout();
  const isFocused = useIsFocused();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Inventory'>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Inventory'>>();
  const { entitlements, canBillScan, refresh: refreshEntitlements } = useEntitlements();
  const { startUpgrade } = usePlanUpgrade();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<ExpiringItem[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabValue>('all');
  const [expiringSoonFilter, setExpiringSoonFilter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  // FAB group (native) / FAB menu (web — avoids nested <button> hydration warning)
  const [fabOpen, setFabOpen] = useState(false);
  const [webMenuVisible, setWebMenuVisible] = useState(false);

  // Manual add bottom sheet
  const [addModalVisible, setAddModalVisible] = useState(false);

  // Edit expiry modal
  const [editTarget, setEditTarget] = useState<InventoryItem | ExpiringItem | null>(null);
  const [editExpiry, setEditExpiry] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  // Scan modal
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [billPick, setBillPick] = useState<BillScanPick | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>({});
  const [addingScanned, setAddingScanned] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    warning?: boolean;
    icon?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const { version: refreshVersion, bump } = useAppRefresh();

  const loadData = useCallback(async () => {
    try {
      const [inv, exp, expd] = await Promise.all([
        api.fetchInventory(),
        api.fetchExpiringItems(),
        api.fetchExpiredItems(),
      ]);
      setInventory(Array.isArray(inv) ? inv : []);
      setExpiringItems(Array.isArray(exp) ? exp : []);
      setExpiredItems(Array.isArray(expd) ? expd : []);
    } catch (e) {
      console.error('Failed to load inventory:', e);
      setInventory([]);
      setExpiringItems([]);
      setExpiredItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  useEffect(() => {
    void loadData();
  }, [loadData, refreshVersion]);

  // Deep links from Home (expired banner / expiring soon). Use primitive deps only —
  // `route.params` object identity changes every render on web and caused setParams loops.
  useEffect(() => {
    const tabParam = route.params?.tab;
    const expiringSoonParam = route.params?.expiringSoon;
    if (tabParam !== 'expired' && !expiringSoonParam) return;

    if (tabParam === 'expired') {
      setTab('expired');
      setExpiringSoonFilter(false);
    } else if (expiringSoonParam) {
      setTab('all');
      setExpiringSoonFilter(true);
    }

    navigation.setParams({ tab: undefined, expiringSoon: undefined });
  }, [route.params?.tab, route.params?.expiringSoon, navigation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const showSnack = (msg: string) => {
    setSnackMsg(msg);
    setSnackVisible(true);
  };

  // ── Edit Expiry ──────────────────────────────────────────────

  const openEditExpiry = (item: InventoryItem | ExpiringItem) => {
    setEditTarget(item);
    setEditExpiry(item.estimated_expiry ? item.estimated_expiry.slice(0, 10) : '');
  };

  const closeEditExpiry = () => {
    setEditTarget(null);
    setEditExpiry('');
    setSavingExpiry(false);
  };

  const handleSaveExpiry = async () => {
    if (!editTarget) return;
    const trimmed = editExpiry.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      showAppInfo('Use YYYY-MM-DD or leave blank to clear.');
      return;
    }
    setSavingExpiry(true);
    try {
      await api.updateInventoryItem(editTarget.item_id, {
        canonical_name: editTarget.canonical_name,
        qty: editTarget.qty,
        unit: editTarget.unit,
        estimated_expiry: trimmed || undefined,
        is_manual: 'is_manual' in editTarget ? editTarget.is_manual : true,
      });
      await loadData();
      showSnack(trimmed ? `Expiry updated for "${editTarget.canonical_name}"` : `Expiry cleared for "${editTarget.canonical_name}"`);
      closeEditExpiry();
    } catch {
      showAppError('Could not update expiry.');
    } finally {
      setSavingExpiry(false);
    }
  };

  // ── Mark as Expired ──────────────────────────────────────────

  const handleExpireItem = (item: InventoryItem) => {
    setConfirmDialog({
      title: 'Mark as expired?',
      message: `"${item.canonical_name}" will move to the Expired tab. You can add it to shopping or remove it later.`,
      confirmLabel: 'Mark expired',
      warning: true,
      icon: 'clock-alert-outline',
      onConfirm: async () => {
        await api.expireInventoryItem(item.item_id);
        await loadData();
        showSnack(`"${item.canonical_name}" moved to expired`);
      },
    });
  };

  // ── Expired → Shopping ────────────────────────────────────

  const handleAddToShopping = async (item: ExpiringItem) => {
    try {
      await api.addShoppingItem(item.canonical_name, item.qty, item.unit);
      await api.deleteInventoryItem(item.item_id);
      await loadData();
      showSnack(`"${item.canonical_name}" added to shopping list`);
      bump();
    } catch {
      showAppError('Could not add to shopping list.');
    }
  };

  const handleDeleteExpired = (item: ExpiringItem) => {
    setConfirmDialog({
      title: 'Remove from inventory?',
      message: `"${item.canonical_name}" will be deleted permanently. This cannot be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: async () => {
        await api.deleteInventoryItem(item.item_id);
        await loadData();
        showSnack(`"${item.canonical_name}" removed`);
      },
    });
  };

  const handleConfirmDialog = async () => {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch {
      showAppError('Something went wrong. Try again.');
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── Scan Bill ─────────────────────────────────────────────

  const openScanModal = () => {
    if (!canBillScan) {
      showUpgradeMessage(
        entitlements?.bill_scans_used != null
          ? `You've used all ${entitlements.bill_scan_limit} free bill scans for today.`
          : 'Daily bill scan limit reached on the free plan.',
        startUpgrade,
      );
      return;
    }
    setBillPick(null);
    setScanResult(null);
    setScanning(false);
    setSelectedItems({});
    setAddingScanned(false);
    setScanModalVisible(true);
  };

  const closeScanModal = () => {
    setScanModalVisible(false);
    setCameraModalVisible(false);
    setBillPick(null);
    setScanResult(null);
    setSelectedItems({});
    setAddingScanned(false);
  };

  const toggleItem = (idx: number) => {
    setSelectedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const selectAll = () => {
    if (!scanResult?.items) return;
    const allSelected = scanResult.items.every((_, i) => selectedItems[i] !== false);
    const next: Record<number, boolean> = {};
    scanResult.items.forEach((_, i) => { next[i] = !allSelected; });
    setSelectedItems(next);
  };

  const handleAddSelectedItems = async () => {
    if (!scanResult?.items) return;
    const toAdd = scanResult.items.filter((_, i) => selectedItems[i] !== false);
    if (toAdd.length === 0) {
      showAppInfo('Select at least one item to add.');
      return;
    }

    setAddingScanned(true);
    let addedCount = 0;
    const errors: string[] = [];

    for (const item of toAdd) {
      try {
        const shelfDays = item.shelf_life_days || 7;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + shelfDays);
        const expiryStr = expiry.toISOString().split('T')[0];

        await api.addInventoryItem({
          canonical_name: item.name,
          qty: item.quantity,
          unit: item.unit,
          estimated_expiry: expiryStr,
        });
        addedCount++;
      } catch {
        errors.push(item.name);
      }
    }

    setAddingScanned(false);
    await loadData();

    if (errors.length > 0) {
      showAppInfo(`Added ${addedCount} items. Some failed: ${errors.join(', ')}`);
    } else {
      showAppSuccess(`Added ${addedCount} items to inventory.`);
    }
    closeScanModal();
  };

  const applyBillPick = (pick: BillScanPick | string) => {
    if (typeof pick === 'string') {
      setBillPick({ uri: pick, mimeType: 'image/jpeg' });
    } else {
      setBillPick(pick);
    }
    setScanResult(null);
  };

  const pickFromCamera = () => {
    if (Platform.OS === 'web') {
      void (async () => {
        const pick = await pickBillImageFromCameraWeb();
        if (pick) applyBillPick(pick);
      })();
      return;
    }
    setCameraModalVisible(true);
  };

  const pickFromFile = async () => {
    const pick = await pickBillFileFromDevice();
    if (pick) applyBillPick(pick);
  };

  const handleScan = async () => {
    if (!billPick) {
      showAppInfo('Take a photo with the camera or upload an image/PDF first.');
      return;
    }
    if (!canBillScan) {
      showUpgradeMessage('Free plan includes 2 bill scans per day (camera or upload).', startUpgrade);
      return;
    }
    setScanning(true);
    setScanResult(null);
    setSelectedItems({});
    try {
      const result = await api.scanBillUpload(billPick.uri, billPick.mimeType);
      setScanResult(result);
      await refreshEntitlements();
      if (result.items && result.items.length > 0) {
        const allSelected: Record<number, boolean> = {};
        result.items.forEach((_: any, i: number) => { allSelected[i] = true; });
        setSelectedItems(allSelected);
      }
    } catch (e: unknown) {
      console.error('Scan error:', e);
      if (e instanceof UpgradeRequiredError) {
        showUpgradeMessage(e.message, startUpgrade);
        void refreshEntitlements();
      } else {
        showAppAlert(BILL_SCAN_ALERT_TITLE, BILL_SCAN_ALERT_MESSAGE);
      }
    } finally {
      setScanning(false);
    }
  };

  // ── Filtered lists ──────────────────────────────────────────

  const searchLower = search.toLowerCase();

  const expiringIds = new Set(expiringItems.map((e) => e.item_id));

  const filteredInventory = inventory
    .filter((item) => item.canonical_name.toLowerCase().includes(searchLower))
    .filter((item) => !expiringSoonFilter || expiringIds.has(item.item_id));

  const filteredExpired = expiredItems.filter((item) =>
    item.canonical_name.toLowerCase().includes(searchLower),
  );

  // ── Render ────────────────────────────────────────────────

  const renderExpiredCard = ({ item }: { item: ExpiringItem }) => (
    <Card style={styles.expiredCard} mode="elevated">
      <Card.Content style={styles.expiredContent}>
        <View style={styles.expiredInfo}>
          <Text variant="titleSmall" style={styles.expiredName}>{item.canonical_name}</Text>
          <Text variant="bodySmall" style={styles.expiredQty}>{item.qty} {item.unit}</Text>
          <Text variant="labelSmall" style={styles.expiredDays}>
            Expired {Math.abs(item.days_until_expiry)} day{Math.abs(item.days_until_expiry) !== 1 ? 's' : ''} ago
          </Text>
        </View>
        <View style={styles.expiredActions}>
          <IconButton
            icon="calendar-edit"
            iconColor="#2E7D32"
            size={22}
            onPress={() => openEditExpiry(item)}
            style={styles.actionBtn}
          />
          <IconButton
            icon="cart-plus"
            iconColor="#388E3C"
            size={22}
            onPress={() => handleAddToShopping(item)}
            style={styles.actionBtn}
          />
          <IconButton
            icon="delete-outline"
            iconColor="#F44336"
            size={22}
            onPress={() => handleDeleteExpired(item)}
            style={styles.actionBtn}
          />
        </View>
      </Card.Content>
    </Card>
  );

  const listContentStyle = [styles.list, { paddingBottom: contentPaddingBottom(96) }];

  const webFabAnchor = useMemo(
    () => (
      <FAB
        icon="plus"
        style={styles.fab}
        color="#fff"
        onPress={() => setWebMenuVisible(true)}
      />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextBlock}>
            <Text variant="headlineSmall" style={styles.headerTitle}>
              Inventory
            </Text>
            <Text variant="bodyMedium" style={styles.headerSub}>
              {loading
                ? 'Loading your kitchen…'
                : `${inventory.length} in stock · ${expiringItems.length} expiring soon · ${expiredItems.length} expired`}
            </Text>
          </View>
          <ProfileHeaderButton />
        </View>
      </View>

      <Searchbar
        placeholder="Search items…"
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
        inputStyle={styles.searchInput}
        iconColor="#2E7D32"
        elevation={2}
      />

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as TabValue)}
        buttons={[
          { value: 'all', label: `Items (${inventory.length})` },
          { value: 'expired', label: `Expired (${expiredItems.length})` },
        ]}
        style={styles.tabs}
      />

      {tab === 'all' && (
        <>
          <View style={styles.filterRow}>
            <Button
              mode={expiringSoonFilter ? 'contained' : 'outlined'}
              icon="clock-alert-outline"
              compact
              onPress={() => setExpiringSoonFilter(!expiringSoonFilter)}
              buttonColor={expiringSoonFilter ? '#FF9800' : undefined}
              textColor={expiringSoonFilter ? '#fff' : '#FF9800'}
              style={styles.filterChip}
              disabled={expiringItems.length === 0}
            >
              Expiring Soon ({expiringItems.length})
            </Button>
          </View>
          <FlatList
            data={filteredInventory}
            renderItem={({ item }) => (
              <InventoryItemCard
                item={item}
                onExpire={handleExpireItem}
                onEditExpiry={openEditExpiry}
              />
            )}
            keyExtractor={(item) => item.item_id}
            contentContainerStyle={listContentStyle}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <Text variant="bodyMedium" style={styles.emptyText}>
                {loading
                  ? 'Loading...'
                  : expiringSoonFilter
                    ? 'No items expiring soon — you\'re in good shape!'
                    : 'No items yet. Tap + to add manually or scan a bill.'}
              </Text>
            }
          />
        </>
      )}

      {tab === 'expired' && (
        <FlatList
          data={filteredExpired}
          renderItem={renderExpiredCard}
          keyExtractor={(item) => item.item_id}
          contentContainerStyle={listContentStyle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            expiredItems.length > 0 ? (
              <Surface style={styles.expiredBanner} elevation={0}>
                <IconButton icon="alert-circle" iconColor="#F44336" size={20} style={{ margin: 0 }} />
                <Text variant="bodySmall" style={styles.expiredBannerText}>
                  Showing items expired in the last 7 days. Tap the calendar to extend, cart to re-order, or trash to remove. Items older than 7 days are auto-deleted.
                </Text>
              </Surface>
            ) : null
          }
          ListEmptyComponent={
            <Text variant="bodyMedium" style={styles.emptyText}>
              No expired items — great job managing your kitchen!
            </Text>
          }
        />
      )}

      {/* FAB — two ways to add items.
          On native we use FAB.Group (renders as Views).
          On web we use FAB + Menu — FAB.Group emits nested <button> on RNW,
          which produces a React DOM hydration warning. */}
      {isFocused && (Platform.OS === 'web' ? (
        <View
          style={[
            styles.webFabWrap,
            { bottom: totalHeight + 16 },
          ]}
          pointerEvents="box-none"
        >
          <Menu
            visible={webMenuVisible}
            onDismiss={() => setWebMenuVisible(false)}
            anchor={webFabAnchor}
            anchorPosition="top"
          >
            <Menu.Item
              leadingIcon="pencil-plus"
              title="Add Manually"
              onPress={() => {
                setWebMenuVisible(false);
                setAddModalVisible(true);
              }}
            />
            <Menu.Item
              leadingIcon="camera"
              title="Scan & Add"
              onPress={() => {
                setWebMenuVisible(false);
                openScanModal();
              }}
            />
          </Menu>
        </View>
      ) : (
        <Portal>
          <FAB.Group
            open={fabOpen}
            visible
            icon={fabOpen ? 'close' : 'plus'}
            actions={[
              {
                icon: 'pencil-plus',
                label: 'Add Manually',
                onPress: () => setAddModalVisible(true),
                style: { backgroundColor: '#2E7D32' },
                color: '#fff',
              },
              {
                icon: 'camera',
                label: 'Scan & Add',
                onPress: openScanModal,
                style: { backgroundColor: colors.scan },
                color: '#fff',
              },
            ]}
            onStateChange={({ open }) => setFabOpen(open)}
            fabStyle={styles.fab}
            style={{ paddingBottom: contentPaddingBottom(8) }}
          />
        </Portal>
      ))}

      <AddInventoryModal
        visible={addModalVisible}
        onDismiss={() => setAddModalVisible(false)}
        onAdded={() => void loadData()}
      />

      {/* ── Edit Expiry Modal ────────────────────────────────── */}
      {editTarget !== null && (
      <Portal>
        <Modal
          visible
          onDismiss={closeEditExpiry}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>
            {editTarget ? `Update expiry — ${editTarget.canonical_name}` : 'Update expiry'}
          </Text>
          <Divider style={styles.modalDivider} />

          <Text variant="bodySmall" style={{ color: '#666', marginBottom: 12 }}>
            Set a new date (YYYY-MM-DD), or leave blank to clear and let AI re-estimate.
          </Text>

          <TextInput
            label="Expiry Date"
            value={editExpiry}
            onChangeText={setEditExpiry}
            mode="outlined"
            style={styles.input}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          />

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={closeEditExpiry} disabled={savingExpiry}>
              Cancel
            </Button>
            <Button mode="contained" onPress={handleSaveExpiry} loading={savingExpiry}>
              Save
            </Button>
          </View>
        </Modal>
      </Portal>
      )}

      <BillCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptured={(uri) => applyBillPick(uri)}
      />

      {/* ── Scan Bill Modal ──────────────────────────────────── */}
      {scanModalVisible && (
      <Portal>
        <Modal
          visible
          onDismiss={closeScanModal}
          contentContainerStyle={styles.scanModal}
        >
          <View style={styles.scanModalHeader}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Scan Grocery Bill
            </Text>
            <IconButton icon="close" size={22} onPress={closeScanModal} />
          </View>
          <Divider style={styles.modalDivider} />

          <ScrollView style={styles.scanModalScroll} showsVerticalScrollIndicator={false}>
            {!scanResult && (
              <>
                <Text variant="bodyMedium" style={styles.scanDesc}>
                  Snap a photo or upload an image or PDF of your grocery bill. Videos are not supported.
                </Text>
                {entitlements && !entitlements.is_pro ? (
                  <Text variant="labelMedium" style={styles.scanQuota}>
                    Free plan: {entitlements.bill_scans_remaining} of {entitlements.bill_scan_limit} bill scans left today
                  </Text>
                ) : null}

                {billPick && (
                  <Surface style={styles.imageContainer} elevation={1}>
                    {isPdfBillPick(billPick) ? (
                      <View style={styles.pdfPreview}>
                        <Icon source="file-pdf-box" size={48} color="#C62828" />
                        <Text variant="bodyMedium" style={styles.pdfName} numberOfLines={2}>
                          {billPick.name || 'Bill PDF'}
                        </Text>
                      </View>
                    ) : (
                      <Image source={{ uri: billPick.uri }} style={styles.image} resizeMode="contain" />
                    )}
                    <Button
                      mode="text"
                      compact
                      onPress={() => { setBillPick(null); setScanResult(null); }}
                      textColor="#F44336"
                    >
                      Remove
                    </Button>
                  </Surface>
                )}

                <View style={styles.pickRow}>
                  <Button
                    mode="contained"
                    icon="camera"
                    onPress={pickFromCamera}
                    style={styles.pickButton}
                    buttonColor={colors.scan}
                    disabled={scanning}
                  >
                    Camera
                  </Button>
                  <Button
                    mode="contained"
                    icon="file-upload"
                    onPress={pickFromFile}
                    style={styles.pickButton}
                    buttonColor={colors.scan}
                    disabled={scanning}
                  >
                    Upload
                  </Button>
                </View>

                <Button
                  mode="contained"
                  icon="magnify-scan"
                  onPress={handleScan}
                  loading={scanning}
                  disabled={scanning || !billPick}
                  style={styles.scanBtn}
                  contentStyle={{ paddingVertical: 6 }}
                >
                  {scanning ? 'Scanning...' : 'Scan'}
                </Button>

                {scanning && (
                  <View style={styles.scanStatus}>
                    <ActivityIndicator size="large" />
                    <Text variant="bodyMedium" style={styles.scanningText}>
                      Reading your bill...
                    </Text>
                  </View>
                )}
              </>
            )}

            {scanResult && scanResult.items && scanResult.items.length > 0 && (
              <>
                <Text variant="bodyMedium" style={styles.scanDesc}>
                  Found {scanResult.items.length} edible items. Uncheck any you don't want to add.
                </Text>

                <View style={styles.selectAllRow}>
                  <Button mode="text" compact onPress={selectAll}>
                    {scanResult.items.every((_, i) => selectedItems[i] !== false)
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                  <Text variant="bodySmall" style={{ color: '#666' }}>
                    {Object.values(selectedItems).filter(Boolean).length} of {scanResult.items.length} selected
                  </Text>
                </View>

                {scanResult.items.map((item, idx) => (
                  <Surface key={idx} style={styles.confirmItemRow} elevation={1}>
                    <Checkbox
                      status={selectedItems[idx] !== false ? 'checked' : 'unchecked'}
                      onPress={() => toggleItem(idx)}
                    />
                    <View style={styles.confirmItemInfo}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600', color: '#333' }}>
                        {item.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: '#666' }}>
                        {item.quantity} {item.unit}
                        {item.shelf_life_days ? `  ·  ~${item.shelf_life_days} day shelf life` : ''}
                      </Text>
                    </View>
                  </Surface>
                ))}

                <View style={styles.confirmActions}>
                  <Button
                    mode="outlined"
                    onPress={() => { setScanResult(null); setSelectedItems({}); }}
                    style={{ flex: 1 }}
                  >
                    Re-scan
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleAddSelectedItems}
                    loading={addingScanned}
                    disabled={addingScanned || Object.values(selectedItems).filter(Boolean).length === 0}
                    style={{ flex: 1, borderRadius: 12 }}
                  >
                    Add ({Object.values(selectedItems).filter(Boolean).length})
                  </Button>
                </View>
              </>
            )}

            {scanResult && (!scanResult.items || scanResult.items.length === 0) && (
              <View style={styles.scanStatus}>
                <Text variant="bodyMedium" style={{ color: '#999', textAlign: 'center' }}>
                  No edible items found on this bill. Try a clearer photo.
                </Text>
                <Button
                  mode="outlined"
                  onPress={() => { setScanResult(null); setBillPick(null); }}
                  style={{ marginTop: 16 }}
                >
                  Try Again
                </Button>
              </View>
            )}
          </ScrollView>
        </Modal>
      </Portal>
      )}

      <AppConfirmDialog
        visible={confirmDialog != null}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        destructive={confirmDialog?.destructive}
        warning={confirmDialog?.warning}
        icon={confirmDialog?.icon}
        loading={confirmLoading}
        onDismiss={() => !confirmLoading && setConfirmDialog(null)}
        onConfirm={() => void handleConfirmDialog()}
      />

      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={2500}
        action={{ label: 'OK', onPress: () => setSnackVisible(false) }}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.92)',
    marginTop: 6,
    lineHeight: 22,
  },
  searchbar: {
    marginHorizontal: 16,
    marginTop: -10,
    marginBottom: 8,
    borderRadius: 14,
    elevation: 2,
    backgroundColor: '#fff',
  },
  searchInput: {
    minHeight: 20,
  },
  tabs: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterChip: {
    alignSelf: 'flex-start',
    borderColor: '#FF9800',
    borderRadius: 20,
  },
  list: {
    padding: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    paddingHorizontal: 32,
  },
  fab: {
    backgroundColor: '#2E7D32',
  },
  webFabWrap: {
    position: 'absolute',
    right: 16,
  },

  // Expired tab
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 8,
    paddingRight: 16,
    marginBottom: 12,
  },
  expiredBannerText: {
    flex: 1,
    color: '#C62828',
  },
  expiredCard: {
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  expiredContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiredInfo: {
    flex: 1,
    gap: 2,
  },
  expiredName: {
    fontWeight: '600',
  },
  expiredQty: {
    color: '#666',
  },
  expiredDays: {
    color: '#F44336',
    fontWeight: '600',
    marginTop: 2,
  },
  expiredActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    margin: 0,
  },

  // Shared modal
  modal: {
    backgroundColor: 'white',
    margin: 20,
    padding: 24,
    borderRadius: 16,
  },
  modalTitle: {
    fontWeight: 'bold',
  },
  modalDivider: {
    marginVertical: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  input: {
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },

  // Scan modal
  scanModal: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 16,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  scanModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 8,
    paddingTop: 16,
  },
  scanModalScroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  scanDesc: {
    color: '#666',
    lineHeight: 22,
    marginBottom: 8,
  },
  scanQuota: {
    color: '#E65100',
    fontWeight: '600',
    marginBottom: 16,
  },
  imageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 220,
  },
  pdfPreview: {
    width: '100%',
    minHeight: 120,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pdfName: {
    color: '#444',
    textAlign: 'center',
    fontWeight: '600',
  },
  pickRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  pickButton: {
    flex: 1,
    borderRadius: 12,
  },
  scanBtn: {
    borderRadius: 12,
    marginBottom: 16,
  },
  scanStatus: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  scanningText: {
    marginTop: 12,
    color: '#666',
  },
  scanResultCard: {
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  selectAllRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  confirmItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  confirmItemInfo: {
    flex: 1,
    marginLeft: 4,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 24,
  },
});
