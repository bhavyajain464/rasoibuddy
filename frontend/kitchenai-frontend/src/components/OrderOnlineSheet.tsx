import React, { useState } from 'react';
import { View, StyleSheet, Platform, Linking, ScrollView } from 'react-native';
import { Portal, Modal, Text, Button, IconButton, Icon, Divider } from 'react-native-paper';
import * as api from '../services/api';
import { CommercePartner, UserShoppingItem } from '../types';
import { copyToClipboard } from '../utils/copyToClipboard';
import { showAppError, showAppSuccess } from '../utils/alertMessage';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: UserShoppingItem[];
  partners: CommercePartner[];
  source?: string;
};

// OrderOnlineSheet: pick a store, then open a search per product. Quick-commerce apps only
// search one item at a time, so we give a per-item "Open" action (plus copy-all as a fallback).
export function OrderOnlineSheet({ visible, onClose, items, partners, source = 'shopping_list' }: Props) {
  const [partner, setPartner] = useState<CommercePartner | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  const close = () => {
    setPartner(null);
    setBusy(null);
    setOpened({});
    onClose();
  };

  const openUrl = async (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }
    const ok = await Linking.canOpenURL(url).catch(() => true);
    if (ok) await Linking.openURL(url);
  };

  // Open the partner's search for a single product.
  const handleItem = async (item: UserShoppingItem) => {
    if (!partner || busy) return;
    setBusy(item.id);
    try {
      const res = await api.createOrderLink(
        partner.id,
        [{ name: item.name, qty: item.qty, unit: item.unit }],
        'shopping_item',
      );
      await openUrl(res.url);
      setOpened((prev) => ({ ...prev, [item.id]: true }));
    } catch (e) {
      showAppError(e instanceof Error ? e.message : 'Could not open this item. Try again.');
    } finally {
      setBusy(null);
    }
  };

  // Copy the whole list (fallback — paste into the store's search).
  const handleCopyAll = async () => {
    if (!partner || busy) return;
    setBusy('__copy__');
    try {
      const payload = items
        .filter((it) => it.name && it.name.trim())
        .map((it) => ({ name: it.name, qty: it.qty, unit: it.unit }));
      const res = await api.createOrderLink(partner.id, payload, source);
      if (res.copy_text) await copyToClipboard(res.copy_text).catch(() => undefined);
      showAppSuccess('List copied — paste into the store search.');
    } catch {
      showAppError('Could not copy the list.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={close} contentContainerStyle={styles.modal}>
        {!partner ? (
          <>
            <Text variant="titleMedium" style={styles.title}>Order online — pick a store</Text>
            <Text variant="bodySmall" style={styles.sub}>
              Then tap each item to open its search in the app.
            </Text>
            <View style={styles.partners}>
              {partners.map((p) => (
                <Button
                  key={p.id}
                  mode="outlined"
                  icon={() => <Icon source="storefront-outline" size={18} color="#2E7D32" />}
                  onPress={() => setPartner(p)}
                  style={styles.partnerBtn}
                  contentStyle={styles.partnerBtnContent}
                  textColor="#1B5E20"
                >
                  {p.eta ? `${p.name} · ${p.eta}` : p.name}
                </Button>
              ))}
            </View>
            <Button onPress={close} textColor="#888" style={{ marginTop: 4 }}>Cancel</Button>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
              <IconButton icon="arrow-left" size={20} onPress={() => setPartner(null)} style={{ margin: 0 }} />
              <Text variant="titleMedium" style={styles.titleInline}>Open on {partner.name}</Text>
            </View>
            <Text variant="bodySmall" style={styles.sub}>
              Tap a product to search it on {partner.name}, add it, then come back for the next.
            </Text>

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {items.map((it) => (
                <View key={it.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={styles.itemName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    {it.qty ? (
                      <Text variant="bodySmall" style={styles.itemQty}>{it.qty} {it.unit}</Text>
                    ) : null}
                  </View>
                  <Button
                    mode={opened[it.id] ? 'text' : 'contained-tonal'}
                    compact
                    loading={busy === it.id}
                    disabled={!!busy}
                    onPress={() => handleItem(it)}
                    textColor="#1B5E20"
                    icon={opened[it.id] ? 'check' : 'magnify'}
                  >
                    {opened[it.id] ? 'Opened' : 'Open'}
                  </Button>
                </View>
              ))}
            </ScrollView>

            <Divider style={{ marginVertical: 8 }} />
            <Button
              onPress={handleCopyAll}
              loading={busy === '__copy__'}
              disabled={!!busy}
              icon="content-copy"
              textColor="#2E7D32"
            >
              Copy whole list
            </Button>
            <Button onPress={close} textColor="#888">Done</Button>
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 16, padding: 20 },
  title: { color: '#1A1A1A', fontWeight: '600' },
  titleInline: { color: '#1A1A1A', fontWeight: '600', flex: 1 },
  sub: { color: '#666', marginTop: 4, marginBottom: 14 },
  partners: { gap: 10 },
  partnerBtn: { borderColor: '#A5D6A7', borderRadius: 12 },
  partnerBtnContent: { height: 46, justifyContent: 'flex-start' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  list: { maxHeight: 340 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 8,
  },
  itemName: { color: '#1A1A1A' },
  itemQty: { color: '#888' },
});
